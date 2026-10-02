import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {updateProductPrices,safeProductPriceError} from '../lib/warlock-commerce/product-prices.ts';
const original=[1,2].map(n=>({id:'v'+n,productId:'p1',label:n===1?'2XL':'3XL',retailPriceCents:5700,currency:'USD',updatedAt:new Date(),etsyListingId:'1234',printfulSyncVariantId:'5000000001',productionBaseCents:3248,productionQuoteJson:'configured quote'}));
const input={productId:'p1',confirmPrices:true,prices:original.map(v=>({variantId:v.id,expectedRetailPriceCents:5700,retailPriceCents:5744}))};
function fixture(){
 const variants=structuredClone(original),writes=[],journal=[];
 const tx={spellmarkJournal:{create:async({data})=>{journal.push(data);return data;}},$queryRaw:async()=>[],spellmarkVariant:{findMany:async({where})=>variants.filter(v=>v.productId===where.productId && where.id.in.includes(v.id)),updateMany:async({where,data})=>{writes.push({where,data});Object.assign(variants.find(v=>v.id===where.id),data);return {count:1};}}};
 const db={$transaction:async(callback,options)=>{assert.equal(options.isolationLevel,'Serializable');const before=structuredClone(variants);try{return await callback(tx);}catch(error){variants.splice(0,variants.length,...before);throw error;}}};return {db,variants,writes,tx,journal};
}
test('confirmed post-draft price edits update only the selected retail fields; exact retry is a no-op',async()=>{
 const {db,variants,writes,journal}=fixture();const result=await updateProductPrices(input,db);
 assert.equal(result.state,'CANONICAL_PRICES_SAVED');assert.deepEqual(variants.map(v=>v.retailPriceCents),[5744,5744]);assert.equal(result.etsyMutated,false);assert.equal(result.printfulMutated,false);
 assert.ok(writes.every(w=>Object.keys(w.data).join()==='retailPriceCents'));assert.deepEqual(variants.map(v=>v.productionQuoteJson),original.map(v=>v.productionQuoteJson));assert.equal(variants[0].etsyListingId,'1234');assert.equal(variants[0].printfulSyncVariantId,'5000000001');
 const retry=await updateProductPrices(input,db);assert.ok(retry.prices.every(p=>p.changed===false));assert.equal(writes.length,2);assert.equal(journal.length,1);assert.equal(JSON.parse(journal[0].bodyJson).prices.length,2);
});
test('invalid money, missing confirmation, duplicate variants and extra fields cannot edit prices',async()=>{
 for(const change of [i=>delete i.confirmPrices,i=>i.confirmPrices=false,i=>i.prices[0].retailPriceCents=57.44,i=>i.prices[0].retailPriceCents=0,i=>i.prices[0].retailPriceCents=2147483648,i=>delete i.prices[0].expectedRetailPriceCents,i=>i.prices.push({...i.prices[0]}),i=>i.prices[0].etsyListingId='other']){
  const {db,writes}=fixture(),i=structuredClone(input);change(i);await assert.rejects(updateProductPrices(i,db));assert.equal(writes.length,0);
 }
});
test('foreign variants, stale prices and unsupported currency reject the entire batch',async()=>{
 for(const change of [f=>f.variants[1].productId='foreign',f=>f.variants[1].retailPriceCents=5800,f=>f.variants[1].currency='EUR']){
  const f=fixture();change(f);await assert.rejects(updateProductPrices(input,f.db));assert.equal(f.writes.length,0);assert.equal(f.variants[0].retailPriceCents,5700);
 }
});
test('concurrent guards roll back earlier updates and database errors never expose credentials',async()=>{
 const f=fixture(),originalUpdate=f.tx.spellmarkVariant.updateMany;f.tx.spellmarkVariant.updateMany=async args=>args.where.id==='v2'?{count:0}:originalUpdate(args);
 await assert.rejects(updateProductPrices(input,f.db),/retail_price_changed_retry/);assert.deepEqual(f.variants.map(v=>v.retailPriceCents),[5700,5700]);
 assert.equal(safeProductPriceError({code:'P2034'}),'retail_price_changed_retry');assert.equal(safeProductPriceError(Error('postgresql://secret')),'canonical_price_update_failed');
});
test('MCP advertises the dedicated confirmed price path and preserves intake lock',()=>{
 const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');const server=source('lib/warlock-mcp/server.ts');assert.match(server,/'?"update_product_prices"/);assert.match(server,/inputSchema: productPricesShape/);assert.match(source('lib/warlock-commerce/product-prices.ts'),/confirmPrices:z.literal\(true\)/);assert.match(source('lib/warlock-intake.ts'),/intake_locked_after_draft_execution/);
});
