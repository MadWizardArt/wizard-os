import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inspectLiveVariantPrices,updateLiveVariantPrices,safeLivePriceError} from '../lib/warlock-commerce/live-prices.ts';
import {readSyncConfiguration} from '../lib/warlock-commerce/printful-sync-configuration.ts';
import {runPrintfulSupplierPreflight} from '../lib/warlock-commerce/printful-preflight.ts';
import {assertCommercePriceWritesEnabled,publishingEnabled} from '../lib/warlock-commerce/write-guard.ts';
function fixture(){
 const calls=[],manifest={id:'p1',title:'Night Herbarium',description:'AI-assisted art',assets:[],listings:[{id:'l1',fulfillment:'PHYSICAL',etsyListingId:'4586039819',printfulSyncProductId:101,status:'SYNCED',title:'Night Herbarium',description:'AI-assisted art',assets:[],taxonomyId:1,shippingProfileId:'1',readinessStateId:'18201076875'}],variants:[1,2,3].map(n=>({id:'v'+n,fulfillment:'PHYSICAL',label:['S','2XL','3XL'][n-1],etsyListingId:'4586039819',etsyProductId:String(2000+n),etsySku:'SM-'+n,printfulSyncVariantId:300+n,printfulProductId:71,printfulVariantId:4000+n,printfulStoreId:99,retailPriceCents:n===1?4000:5744,currency:'USD',productionBaseCents:2000,productionQuotedAt:new Date()}))};
 const listing={listing_id:4586039819,shop_id:123,state:'active'};
 let inventory={products:manifest.variants.map((v,n)=>({product_id:2001+n,sku:v.etsySku,is_deleted:false,property_values:[{property_id:513,property_name:'Edition',scale_id:null,value_ids:[],values:[v.label],scale_name:null}],offerings:[{offering_id:800+n,is_deleted:false,quantity:7+n,is_enabled:true,readiness_state_id:18201076875,price:{amount:n===0?4000:5700,divisor:100,currency_code:'USD'}}]})),price_on_property:[513],quantity_on_property:[],sku_on_property:[513],readiness_state_on_property:[]};
 const printful=new Map(manifest.variants.map((v,n)=>[v.printfulSyncVariantId,{result:{sync_product:{id:101,external_id:'4586039819'},sync_variant:{id:v.printfulSyncVariantId,sync_product_id:101,external_id:v.etsyProductId,sku:v.etsySku,variant_id:v.printfulVariantId,synced:true,currency:'USD',retail_price:n===0?'40.00':'57.00',options:[],files:[{id:81,type:'back',status:'ok',options:[],url:'https://private.example/secret'},{id:82,type:'sleeve_right',status:'ok',options:[]}]}}}]));
 const deps={load:async()=>structuredClone(manifest),etsyRead:async path=>{calls.push({kind:'etsy-get',path});return structuredClone(path.includes('inventory')?inventory:listing);},
 etsyWrite:async(id,body)=>{calls.push({kind:'etsy-put',id,body:structuredClone(body)});inventory={...structuredClone(body),products:body.products.map(p=>{const old=inventory.products.find(v=>v.sku===p.sku);return {...p,product_id:old.product_id,is_deleted:false,offerings:p.offerings.map(o=>({...o,offering_id:old.offerings[0].offering_id,is_deleted:false,price:{amount:Math.round(o.price*100),divisor:100,currency_code:'USD'}}))};})};},
 printful:async(path,store,init={})=>{calls.push({kind:'printful',path,store,init});const payload=printful.get(Number(path.split('/').at(-1)));if(init.method==='PUT'){const body=JSON.parse(init.body);assert.deepEqual(Object.keys(body),['retail_price']);payload.result.sync_variant.retail_price=body.retail_price;}return structuredClone(payload);},
 supplier:async()=>({pass:true,errors:[],variants:manifest.variants.map(v=>({variantId:v.id,pass:true,quote:{catalogProductId:v.printfulProductId,catalogVariantId:v.printfulVariantId,storeId:99,currency:'USD',availability:'in_stock',productionBaseCents:2000,quotedAt:new Date().toISOString(),configurationKind:'CONFIGURED_SYNC',configurationFingerprint:readSyncConfiguration(printful.get(v.printfulSyncVariantId),v.printfulSyncVariantId,v.printfulVariantId,101).fingerprint}}))})};
 return {deps,calls,manifest,listing,printful,get inventory(){return inventory;}};
}
async function request(f){const read=await inspectLiveVariantPrices('p1',123,f.deps);return {productId:'p1',expectedInventoryFingerprint:read.inventoryFingerprint,confirmLivePriceWrite:true,prices:read.variants.filter(v=>v.variantId!=='v1').map(v=>({variantId:v.variantId,expectedEtsyPriceCents:v.etsyPriceCents,expectedPrintfulRetailPriceCents:v.printfulRetailPriceCents,retailPriceCents:v.canonicalRetailPriceCents}))};}
function writes(f){return f.calls.filter(c=>c.kind==='etsy-put'||c.init?.method==='PUT');}
test('inspection reads owned live prices and fingerprints without changing files, prices or listings',async()=>{
 const f=fixture(),r=await inspectLiveVariantPrices('p1',123,f.deps);assert.equal(r.state,'LIVE_PRICES_INSPECTED');assert.match(r.inventoryFingerprint,/^[a-f0-9]{64}$/);assert.equal(r.variants[1].etsyPriceCents,5700);assert.equal(r.variants[1].canonicalRetailPriceCents,5744);assert.equal(r.variants[1].printfulRetailPriceCents,5700);assert.equal(writes(f).length,0);assert.ok(!JSON.stringify(r).includes('private.example'));
});
test('selected live prices update and verify with complete current inventory and retail-only supplier mirrors',async()=>{
 const f=fixture(),raw=await request(f),before=structuredClone(f.inventory),canonical=structuredClone(f.manifest),r=await updateLiveVariantPrices(raw,123,f.deps);
 assert.equal(r.state,'LIVE_PRICES_VERIFIED');assert.equal(r.etsyPricesVerified,true);assert.deepEqual(r.printfulVerifiedVariantIds,['v2','v3']);assert.equal(writes(f).length,3);
 assert.deepEqual(f.inventory.products.map(p=>p.offerings[0].price.amount),[4000,5744,5744]);
 f.inventory.products.forEach((p,i)=>{assert.equal(p.product_id,before.products[i].product_id);assert.equal(p.sku,before.products[i].sku);assert.equal(p.offerings[0].quantity,before.products[i].offerings[0].quantity);assert.equal(p.offerings[0].readiness_state_id,18201076875);assert.equal(p.offerings[0].is_enabled,true);assert.deepEqual(p.property_values.map(v=>v.values),before.products[i].property_values.map(v=>v.values));});
 assert.deepEqual(f.manifest,canonical);assert.equal(f.listing.state,'active');assert.equal(f.printful.get(302).result.sync_variant.files[1].type,'sleeve_right');
 const body=writes(f)[0].body;assert.deepEqual(Object.keys(body).sort(),['products','price_on_property','quantity_on_property','sku_on_property','readiness_state_on_property'].sort());assert.ok(!JSON.stringify(body).includes('product_id'));assert.ok(!JSON.stringify(body).includes('offering_id'));assert.ok(!JSON.stringify(body).includes('scale_name'));
});
test('exact retry verifies the targets without any further Etsy or Printful writes',async()=>{
 const f=fixture(),raw=await request(f);assert.equal((await updateLiveVariantPrices(raw,123,f.deps)).state,'LIVE_PRICES_VERIFIED');f.calls.length=0;
 assert.equal((await updateLiveVariantPrices(raw,123,f.deps)).state,'LIVE_PRICES_VERIFIED');assert.equal(writes(f).length,0);
});
test('ownership, active state, IDs/SKUs, currency, duplicate offerings, stale prices and inventory drift block all writes',async()=>{
 const mutations=[f=>f.listing.shop_id=999,f=>f.listing.state='draft',f=>f.inventory.products[1].sku='FOREIGN',f=>f.inventory.products[1].product_id=999,f=>f.inventory.products[1].offerings[0].price.currency_code='EUR',f=>f.inventory.products[1].offerings.push({...f.inventory.products[1].offerings[0]}),f=>f.inventory.products[1].offerings[0].price.amount=5800,f=>f.inventory.products[0].offerings[0].quantity=2,f=>f.printful.get(302).result.sync_product.external_id='other',f=>f.printful.get(302).result.sync_variant.retail_price='58.00',f=>f.printful.get(302).result.sync_variant.currency='EUR',f=>f.manifest.variants[1].retailPriceCents=5800];
 for(const mutate of mutations){const f=fixture(),raw=await request(f);mutate(f);assert.equal((await updateLiveVariantPrices(raw,123,f.deps)).state,'BLOCKED');assert.equal(writes(f).length,0);}
});
test('missing confirmation, foreign targets and conflicting shared price properties cannot write',async()=>{
 const f=fixture(),raw=await request(f);await assert.rejects(updateLiveVariantPrices({...raw,confirmLivePriceWrite:false},123,f.deps));await assert.rejects(updateLiveVariantPrices({...raw,prices:[raw.prices[0],raw.prices[0]]},123,f.deps));
 const foreign=structuredClone(raw);foreign.prices[0].variantId='foreign';assert.equal((await updateLiveVariantPrices(foreign,123,f.deps)).errorCode,'live_price_target_not_canonical');assert.equal(writes(f).length,0);
 f.inventory.price_on_property=[];const shared=await request(f);assert.equal((await updateLiveVariantPrices(shared,123,f.deps)).errorCode,'live_price_shared_price_property_conflict');assert.equal(writes(f).length,0);
});
test('cost, stock and changes during preflight block writes before the first remote mutation',async()=>{
 for(const mutate of [f=>f.inventory.products[0].offerings[0].quantity=1,f=>f.manifest.variants[1].retailPriceCents=5800]){
  const f=fixture(),raw=await request(f),supplier=f.deps.supplier;f.deps.supplier=async()=>{const result=await supplier();mutate(f);return result;};assert.equal((await updateLiveVariantPrices(raw,123,f.deps)).state,'BLOCKED');assert.equal(writes(f).length,0);
 }
 const expensive=fixture(),a=await request(expensive),supplier=expensive.deps.supplier;expensive.deps.supplier=async()=>{const result=await supplier();result.variants.forEach(v=>v.quote.productionBaseCents=5700);return result;};assert.equal((await updateLiveVariantPrices(a,123,expensive.deps)).errorCode,'live_price_margin_below_floor');assert.equal(writes(expensive).length,0);
 const unavailable=fixture(),b=await request(unavailable);unavailable.deps.supplier=async()=>({pass:false,variants:[],errors:['stock']});assert.equal((await updateLiveVariantPrices(b,123,unavailable.deps)).state,'BLOCKED');assert.equal(writes(unavailable).length,0);
});
test('post-write Etsy verification detects changed inventory and prevents supplier mutations',async()=>{
 const f=fixture(),raw=await request(f),put=f.deps.etsyWrite;f.deps.etsyWrite=async(...args)=>{await put(...args);f.inventory.products[0].offerings[0].quantity=1;};const r=await updateLiveVariantPrices(raw,123,f.deps);
 assert.equal(r.state,'VERIFY_OR_RETRY_REQUIRED');assert.equal(r.etsyWriteAttempted,true);assert.equal(r.etsyPricesVerified,false);assert.equal(r.stage,'VERIFY_ETSY_PRICES');assert.equal(writes(f).length,1);
});
test('ambiguous Etsy timeout after application reports uncertainty and a re-inspected retry avoids duplicate writes',async()=>{
 const f=fixture(),raw=await request(f),put=f.deps.etsyWrite;f.deps.etsyWrite=async(...args)=>{await put(...args);throw Error('sensitive upstream URL');};const r=await updateLiveVariantPrices(raw,123,f.deps);assert.equal(r.state,'VERIFY_OR_RETRY_REQUIRED');assert.equal(r.etsyPricesVerified,false);assert.ok(!JSON.stringify(r).includes('sensitive'));
 f.deps.etsyWrite=put;const retry=await request(f);assert.equal((await updateLiveVariantPrices(retry,123,f.deps)).state,'LIVE_PRICES_VERIFIED');assert.equal(f.calls.filter(c=>c.kind==='etsy-put').length,1);
});
test('partial Printful mirroring reports verified progress and retries only remaining retail fields',async()=>{
 const f=fixture(),raw=await request(f),pf=f.deps.printful;let reject=true;
 f.deps.printful=async(path,store,init={})=>{if(path.endsWith('/303') && init.method==='PUT' && reject)throw Error('printful_http_429');return pf(path,store,init);};
 const first=await updateLiveVariantPrices(raw,123,f.deps);assert.equal(first.state,'VERIFY_OR_RETRY_REQUIRED');assert.equal(first.etsyPricesVerified,true);assert.deepEqual(first.printfulVerifiedVariantIds,['v2']);assert.equal(first.errorCode,'printful_http_429');
 reject=false;f.calls.length=0;const retry=await request(f);assert.equal((await updateLiveVariantPrices(retry,123,f.deps)).state,'LIVE_PRICES_VERIFIED');assert.equal(writes(f).length,1);assert.equal(writes(f)[0].path,'/sync/variant/303');
});
test('Printful file drift after Etsy write blocks retail mirror and unsupported responses never report success',async()=>{
 const f=fixture(),raw=await request(f),put=f.deps.etsyWrite;f.deps.etsyWrite=async(...args)=>{await put(...args);f.printful.get(302).result.sync_variant.files[0].id=999;};const r=await updateLiveVariantPrices(raw,123,f.deps);assert.equal(r.state,'VERIFY_OR_RETRY_REQUIRED');assert.equal(r.errorCode,'live_price_printful_configuration_changed');assert.equal(writes(f).length,1);
});
test('active price capability is separately confirmed and publishing/draft guards stay intact',()=>{
 const old=process.env.WARLOCK_COMMERCE_WRITE_MODE;
 try{delete process.env.WARLOCK_COMMERCE_WRITE_MODE;assert.throws(assertCommercePriceWritesEnabled);process.env.WARLOCK_COMMERCE_WRITE_MODE='draft';assert.doesNotThrow(assertCommercePriceWritesEnabled);assert.equal(publishingEnabled(),false);}finally{if(old===undefined)delete process.env.WARLOCK_COMMERCE_WRITE_MODE;else process.env.WARLOCK_COMMERCE_WRITE_MODE=old;}
 const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8'),transport=source('lib/warlock-commerce/etsy-price-transport.ts');assert.match(transport,/method:"PUT"/);assert.match(transport,/inventory\?legacy=false/);assert.match(transport,/redirect:"error"/);assert.doesNotMatch(transport,/method:"PATCH"|state:"active"|createDraft/);assert.match(source('lib/warlock-commerce/etsy-draft-executor.ts'),/etsy_listing_not_draft/);
 assert.equal(safeLivePriceError(Error('postgresql://secret')),'live_price_request_failed');
});

test('Printful nullable SKU is accepted with exact saved sync, parent listing, catalog and external variant IDs',async()=>{
 const f=fixture();f.printful.get(302).result.sync_variant.sku=null;const raw=await request(f);
 assert.equal((await updateLiveVariantPrices(raw,123,f.deps)).state,'LIVE_PRICES_VERIFIED');
});

test('real configured supplier preflight permits DTG defaults and preserves them through verified live price writes',async()=>{
 const f=fixture();
 for(const payload of f.printful.values()){
  payload.result.sync_variant.options=[{id:'embroidery_type',value:'flat'},{id:'thread_colors',value:[]}];
  payload.result.sync_variant.files[0].options=[{id:'auto_thread_color',value:true}];
 }
 const supplierGet=async(path)=>{
  if(path==='/stores')return {result:[{id:99}]};
  if(path.startsWith('/sync/variant/'))return structuredClone(f.printful.get(Number(path.split('/').at(-1))));
  if(path==='/v2/catalog-products/71')return {data:{id:71,placements:['front','back','sleeve_right'].map(placement=>({placement,technique:'dtg'}))}};
  const id=Number(path.match(/(?:variant\/|catalog-variants\/)(\d+)/)[1]);
  if(path.startsWith('/products/'))return {result:{variant:{id,product_id:71},product:{id:71,techniques:[{key:'dtg',is_default:true}],files:[{id:'default',type:'front',additional_price:null},{id:'back',type:'back'},{id:'sleeve_right',type:'sleeve_right'}]}}};
  if(path.includes('/prices'))return {data:{currency:'USD',variant:{id,techniques:[{technique_key:'dtg',price:'20.00'}]},product:{id:71,placements:['front','back','sleeve_right'].map(id=>({id,technique_key:'dtg',price:id==='sleeve_right'?'3.25':'5.00',layers:[{type:'file',additional_price:'0.00'}]}))}}};
  return {data:{techniques:[{technique:'dtg',selling_regions:[{name:'north_america',availability:'in stock'}]}]}};
 };
 f.deps.supplier=manifest=>runPrintfulSupplierPreflight(manifest,supplierGet);
 const original=structuredClone(f.printful.get(302).result.sync_variant),raw=await request(f);
 const result=await updateLiveVariantPrices(raw,123,f.deps);assert.equal(result.state,'LIVE_PRICES_VERIFIED');
 const after=f.printful.get(302).result.sync_variant;assert.equal(after.retail_price,'57.44');assert.deepEqual(after.files,original.files);assert.deepEqual(after.options,original.options);
 const blocked=fixture();blocked.printful.get(302).result.sync_variant.options=[{id:'inside_pocket',value:true}];
 // Use the real quote path with the changed payload, rather than a canned pass result.
 f.printful.set(302,blocked.printful.get(302));f.calls.length=0;
 const retry=await request(f),failure=await updateLiveVariantPrices(retry,123,f.deps);assert.equal(failure.state,'BLOCKED');assert.equal(failure.stage,'SUPPLIER_PREFLIGHT');assert.equal(writes(f).length,0);assert.ok(JSON.stringify(failure).includes('inside_pocket'));
});
