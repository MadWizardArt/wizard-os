import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reconcileActivePrintful} from '../lib/warlock-commerce/printful-reconciliation.ts';
import {ETSY_AI_DISCLOSURE} from '../lib/warlock-commerce/policy.ts';
const manifest={id:'p1',title:'Night Herbarium',description:ETSY_AI_DISCLOSURE,assets:[{id:'a1',role:'master',contentType:'image/png',fileName:'art.png'}],
 variants:[{id:'v1',fulfillment:'PHYSICAL',label:'Print',printfulProductId:71,printfulVariantId:4011,printfulStoreId:99,etsyListingId:'4586039819',etsySku:'SM-1',etsyProductId:'2001',printfulSyncVariantId:null,retailPriceCents:3000,productionBaseCents:500,productionQuotedAt:new Date(),currency:'USD'}],
 listings:[{id:'l1',fulfillment:'PHYSICAL',etsyListingId:'4586039819',title:'Night Herbarium',description:ETSY_AI_DISCLOSURE,taxonomyId:1,shippingProfileId:'2',readinessStateId:'3',assets:[{kind:'image'}],status:'WAITING_PRINTFUL'}]};
function fixture(){
 const calls=[]; let saved;
 const listing={listing_id:4586039819,shop_id:123,state:'active',listing_type:'physical',description:ETSY_AI_DISCLOSURE};
 const inventory={products:[{product_id:2001,sku:'SM-1',is_deleted:false,offerings:[{is_deleted:false,is_enabled:true,price:{amount:3000,divisor:100,currency_code:'USD'}}]}]};
 const quote={catalogProductId:71,catalogVariantId:4011,storeId:99,currency:'USD',availability:'in_stock',productionBaseCents:500,quotedAt:new Date().toISOString()};
 const deps={etsyRead:async path=>{calls.push({kind:'etsy-get',path});return structuredClone(path.includes('inventory')?inventory:listing);},
 supplier:async m=>{calls.push({kind:'supplier',m});return {pass:true,errors:[],variants:[{variantId:'v1',pass:true,quote}]};},
 verifyMaster:async()=>calls.push({kind:'verify'}),
 sync:{request:async(path,store,init={})=>{calls.push({kind:'printful',path,store,init});if(init.method==='PUT'){const body=JSON.parse(init.body);saved={id:301,sync_product_id:101,synced:true,variant_id:body.variant_id,files:body.files.map((f,i)=>({...f,id:i+1,status:'ok'}))};return {result:{}};} return path.startsWith('/sync/variant/')?{result:{sync_variant:saved ?? {id:301,sync_product_id:101,synced:false,files:[]}}}:{result:{sync_product:{id:101,external_id:'4586039819'},sync_variants:[{id:301,external_id:'2001',sku:'SM-1'}]}};},
 temporaryAsset:async()=>({url:'https://signed.example/art.png'}),saveListing:async(id,data)=>calls.push({kind:'listing-save',id,data}),saveVariant:async(id,data)=>calls.push({kind:'variant-save',id,data})}};
 return {deps,calls,listing,inventory,quote};
}
test('active listing reconciliation preserves Etsy, persists sync IDs, configures supplier without price/SKU fields',async()=>{
 const {deps,calls}=fixture();const result=await reconcileActivePrintful(manifest,123,deps);assert.equal(result.state,'RECONCILED');assert.equal(result.etsyMutated,false);assert.equal(result.printful.printfulSyncProductId,101);
 assert.equal(calls.filter(c=>c.kind==='etsy-get').length,4);assert.equal(calls.find(c=>c.kind==='listing-save').data.printfulSyncProductId,101);assert.equal(calls.find(c=>c.kind==='variant-save').data.printfulSyncVariantId,301);
 const put=calls.find(c=>c.init?.method==='PUT');assert.ok(put);const body=JSON.parse(put.init.body);assert.equal(body.variant_id,4011);assert.ok(body.files[0].url);assert.ok(!('retail_price'in body));assert.ok(!('sku'in body));
 assert.ok(calls.findIndex(c=>c.kind==='variant-save')<calls.indexOf(put));assert.match(result.nextAction,/existing active/);
});
test('draft, foreign shop, missing listing, deleted/extra/duplicate inventory and changed prices block supplier writes',async()=>{
 const mutations=[f=>f.listing.state='draft',f=>f.listing.shop_id=999,f=>f.listing.listing_id=123,f=>f.listing.description='Missing disclosure',f=>f.inventory.products[0].is_deleted=true,f=>f.inventory.products.push({...f.inventory.products[0],product_id:2002}),f=>f.inventory.products[0].sku='OTHER',f=>f.inventory.products[0].product_id=2002,f=>f.inventory.products[0].offerings[0].price.amount=2000,f=>f.inventory.products[0].offerings[0].price.currency_code='EUR',f=>f.inventory.products[0].offerings[0].is_enabled=false];
 for(const mutate of mutations){const f=fixture();mutate(f);const result=await reconcileActivePrintful(manifest,123,f.deps);assert.equal(result.state,'BLOCKED');assert.ok(!f.calls.some(c=>c.kind==='printful'||c.kind.endsWith('-save')));}
});
test('Etsy changes during slow preflight are detected by a second GET-only inspection',async()=>{
 for(const change of [f=>f.listing.state='inactive',f=>f.inventory.products[0].offerings[0].price.amount=2900]){
  const f=fixture();f.deps.verifyMaster=async()=>change(f);const r=await reconcileActivePrintful(manifest,123,f.deps);assert.equal(r.state,'BLOCKED');assert.ok(!f.calls.some(c=>c.init?.method==='PUT'));
 }
});
test('fresh cost increase, stock failure, expired quote and missing private master block reconciliation',async()=>{
 const costly=fixture();costly.quote.productionBaseCents=2900;assert.ok((await reconcileActivePrintful(manifest,123,costly.deps)).blockers.includes('contribution_margin_below_floor'));
 const unavailable=fixture();unavailable.deps.supplier=async()=>({pass:false,errors:['stock'],variants:[]});assert.equal((await reconcileActivePrintful(manifest,123,unavailable.deps)).state,'BLOCKED');
 const expired=fixture();expired.deps.verifyMaster=async()=>expired.quote.quotedAt='2020-01-01';assert.ok((await reconcileActivePrintful(manifest,123,expired.deps)).blockers.includes('live_production_quote_expired'));
 const asset=fixture();asset.deps.verifyMaster=async()=>{throw Error('private token')};assert.deepEqual((await reconcileActivePrintful(manifest,123,asset.deps)).blockers,['canonical_asset_storage_unavailable']);
});
test('import delay and configuration API error preserve active listing and allow confirmed retry',async()=>{
 const waiting=fixture();waiting.deps.sync.request=async()=>null;const r=await reconcileActivePrintful(manifest,123,waiting.deps);assert.equal(r.state,'AWAITING_PRINTFUL_IMPORT');assert.match(r.nextAction,/active Etsy listing is preserved/);
 const failed=fixture();const request=failed.deps.sync.request;failed.deps.sync.request=async(...args)=>{if(args[2]?.method==='PUT')throw Error('printful_http_429');return request(...args)};const bad=await reconcileActivePrintful(manifest,123,failed.deps);assert.equal(bad.state,'BLOCKED');assert.equal(bad.printful.errorCode,'printful_http_429');assert.ok(failed.calls.some(c=>c.kind==='variant-save'));assert.ok(!failed.calls.some(c=>c.data?.status==='SYNCED'));
 const retry=structuredClone(manifest);retry.variants[0].printfulSyncVariantId=301;assert.equal((await reconcileActivePrintful(retry,123,fixture().deps)).state,'RECONCILED');
});
test('separate digital listing is untouched and absent canonical external IDs are resolved by verified live SKU',async()=>{
 const m=structuredClone(manifest);m.variants[0].etsyProductId=null;m.variants.push({id:'d1',fulfillment:'DIGITAL'});m.listings.push({id:'d-list',fulfillment:'DIGITAL',etsyListingId:'999'});
 const f=fixture();assert.equal((await reconcileActivePrintful(m,123,f.deps)).state,'RECONCILED');assert.ok(!f.calls.some(c=>c.path?.includes('999')||c.id==='d1'||c.id==='d-list'));
});
test('API failure details are sanitized and no Etsy mutation transport or draft executor exists in reconciliation',async()=>{
 const f=fixture();f.deps.etsyRead=async()=>{throw Error('private credentials')};const r=await reconcileActivePrintful(manifest,123,f.deps);assert.equal(r.state,'BLOCKED');assert.ok(!JSON.stringify(r).includes('credentials'));
 const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');const transport=source('lib/warlock-commerce/etsy-reconciliation-read.ts');assert.match(transport,/method: "GET"/);assert.match(transport,/redirect: "error"/);
 const executor=source('lib/warlock-commerce/printful-reconciliation-executor.ts');assert.doesNotMatch(executor,/executeEtsyDrafts|etsy-draft-executor/);assert.match(executor,/assertCommerceDraftWritesEnabled/);
 const server=source('lib/warlock-mcp/server.ts');assert.match(server,/confirmReconciliation: z.literal\(true\)/);
 assert.match((source('lib/warlock-commerce/etsy-draft-executor.ts') + source('lib/warlock-commerce/digital-delivery.ts')),/etsy_listing_not_draft/);
});

test('quote expiry during import lookup retains IDs but prevents subsequent supplier writes',async()=>{
 const f=fixture();const original=f.deps.sync.request;
 f.deps.sync.request=async(...args)=>{const result=await original(...args);if(!args[2]?.method)f.quote.quotedAt='2020-01-01';return result;};
 const r=await reconcileActivePrintful(manifest,123,f.deps);assert.equal(r.state,'BLOCKED');assert.equal(r.printful.errorCode,'live_production_quote_expired');assert.ok(f.calls.some(c=>c.kind==='variant-save'));assert.ok(!f.calls.some(c=>c.init?.method==='PUT'));
});
