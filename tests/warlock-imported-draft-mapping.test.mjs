import test from 'node:test';
import assert from 'node:assert/strict';
import { configurePrintfulVariant } from '../lib/warlock-commerce/printful-configuration.ts';
const input={productId:'p1',variantId:'v1',catalogProductId:843,catalogVariantId:22152,storeId:99};
function fixture() {
 const variant={id:'v1',productId:'p1',fulfillment:'PHYSICAL',label:'Ash / 12M',etsyListingId:'123',etsyProductId:'456',etsySku:'SM-ASH-12M',retailPriceCents:2495,
  printfulProductId:null,printfulVariantId:null,printfulStoreId:null,printfulSyncVariantId:null,updatedAt:new Date()};
 const listing={productId:'p1',fulfillment:'PHYSICAL',etsyListingId:'123',printfulSyncProductId:null,
  observationJson:JSON.stringify({source:'ETSY_DRAFT_IMPORT',snapshot:{remoteState:'draft',fulfillment:'PHYSICAL',variants:[variant]}})};
 const remote={listing_id:123,shop_id:77,state:'draft',listing_type:'physical'};
 const product={product_id:456,sku:'SM-ASH-12M',property_values:[{values:['Ash / 12M']}],offerings:[{is_enabled:true,price:{amount:2495,divisor:100,currency_code:'USD'}}]};
 const inventory={products:[product]};let saved=[],locks=0,reads=0,updateCount=1;
 const tx={spellmarkListing:{findUnique:async()=>listing},spellmarkVariant:{updateMany:async args=>{if(updateCount===1)saved.push(args);return {count:updateCount};}},$queryRaw:async()=>{locks++;return [];}};
 const db={spellmarkVariant:{findFirst:async()=>({...variant})},$transaction:async fn=>fn(tx)};
 const read=async path=>{reads++;if(path==='/listings/123')return structuredClone(remote);if(path==='/listings/123/inventory?legacy=false')return structuredClone(inventory);throw Error('unexpected read');};
 const context=async()=>({shopId:77,read});
 const quote=async()=>({availability:'in_stock',productionBaseCents:1152,quotedAt:new Date().toISOString(),currency:'USD'});
 return {variant,listing,remote,product,inventory,db,context,quote,saved,get locks(){return locks;},get reads(){return reads;},set updateCount(v){updateCount=v;}};
}
const run=f=>configurePrintfulVariant(input,f.db,f.quote,f.context);
test('restores an imported draft mapping with live exact identity and preserves price, listing and production',async()=>{
 const f=fixture(),result=await run(f);assert.equal(result.retailPriceCents,2495);assert.equal(f.locks,2);assert.equal(f.reads,3);assert.equal(f.saved.length,1);
 assert.deepEqual(Object.keys(f.saved[0].data).sort(),['currency','printfulProductId','printfulStoreId','printfulVariantId','productionBaseCents','productionQuoteJson','productionQuotedAt'].sort());
 assert.equal(f.saved[0].where.etsyProductId,'456');assert.equal(f.saved[0].where.etsySku,'SM-ASH-12M');assert.equal(f.saved[0].where.retailPriceCents,2495);
});
test('never replaces complete, partial or synced supplier mappings on a linked variant',async()=>{
 for(const field of ['printfulProductId','printfulVariantId','printfulStoreId','printfulSyncVariantId']){const f=fixture();f.variant[field]=999;await assert.rejects(run(f),/mapping_locked/);assert.equal(f.saved.length,0);}
});
test('requires imported draft provenance and matching canonical listing',async()=>{
 for(const mutate of [f=>f.listing.observationJson=null,f=>f.listing.observationJson='{',f=>f.listing.observationJson=f.listing.observationJson.replace('"draft"','"active"'),f=>f.listing.etsyListingId='999',f=>f.listing.printfulSyncProductId='999',f=>f.variant.etsySku='changed']){
  const f=fixture();mutate(f);await assert.rejects(run(f),/identity_changed/);assert.equal(f.saved.length,0);
 }
});
test('rejects active, foreign, wrong type and changed inventory without saving any mapping',async()=>{
 for(const mutate of [f=>f.remote.state='active',f=>f.remote.shop_id=88,f=>f.remote.listing_id=999,f=>f.remote.listing_type='download',f=>f.product.product_id=999,f=>f.product.sku='other',f=>f.product.property_values[0].values=['Indigo / 12M'],f=>f.product.offerings[0].price.amount=2496,f=>f.product.offerings[0].price.currency_code='EUR',f=>f.product.offerings[0].is_enabled=false,f=>f.inventory.products.push(structuredClone(f.product))]){
  const f=fixture();mutate(f);await assert.rejects(run(f),/identity_changed/);assert.equal(f.saved.length,0);
 }
});
test('publication during live reads and concurrent canonical changes fail closed',async()=>{
 const f=fixture();const context=async()=>({shopId:77,read:async path=>{const result=await (await f.context()).read(path);if(path.includes('inventory'))f.remote.state='active';return result;}});
 await assert.rejects(configurePrintfulVariant(input,f.db,f.quote,context),/identity_changed/);assert.equal(f.saved.length,0);
 const raced=fixture();raced.updateCount=0;await assert.rejects(run(raced),/changed_retry/);assert.equal(raced.saved.length,0);
});
