import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPlacementPreview,applyPlacementPreview,verifyPlacementReadback} from '../lib/warlock-commerce/printful-placements.ts';
const position={area_width:1800,area_height:2400,width:1200,height:1600,top:100,left:200,limit_to_print_area:true};
function fixture(){
 const manifest={id:'p',assets:[{id:'a',role:'master',fileName:'back.png',contentType:'image/png'},{id:'b',role:'master',fileName:'sleeve.png',contentType:'image/png'}],listings:[{id:'l',fulfillment:'PHYSICAL',etsyListingId:'123'}],variants:[{id:'v',fulfillment:'PHYSICAL',printfulProductId:71,printfulVariantId:4011,printfulStoreId:99,etsyProductId:'456',etsySku:'SM-1',printfulSyncVariantId:null,retailPriceCents:3000}]};
 const input={productId:'p',variants:[{variantId:'v',files:[{assetId:'a',type:'back',position},{assetId:'b',type:'sleeve_right',position}]}]};
 const calls=[]; let remote={id:301,sync_product_id:101,synced:false,files:[]};let cost='20.00';
 const request=async(path,store,init={})=>{
 calls.push({path,store,init});
 if(path.startsWith('/sync/products/'))return {result:{sync_product:{id:101,external_id:'123'},sync_variants:[{id:301,external_id:'456',sku:'SM-1'}]}};
 if(init.method==='PUT'){const body=JSON.parse(init.body);remote={...remote,synced:true,variant_id:body.variant_id,files:body.files.map((f,i)=>({...f,id:i+81,status:'ok',hash:f.url.endsWith('/a')?'a'.repeat(32):'b'.repeat(32),width:1800,height:2400,dpi:300}))};return {result:{}};}
 return {result:{sync_variant:structuredClone(remote)}};
 };
 const deps={shopId:9,request,prepareCanvas:async(asset,position)=>({asset,md5:asset.id.repeat(32),width:position.area_width,height:position.area_height,dpi:300}),etsyRead:async()=>({shop_id:9,listing_id:123,listing_type:'physical',state:'draft'}),verifyAsset:async()=>{},temporaryAsset:async a=>({url:'https://signed.example/'+a.id}),get:async(path,store)=>{
 if(path.startsWith('/sync/'))return request(path,store);
 if(path==='/stores')return {result:[{id:99}]};
 if(path==='/products/variant/4011')return {result:{variant:{id:4011,product_id:71},product:{id:71,techniques:[{key:'dtg',is_default:true}],files:['default','back','sleeve_right'].map(id=>({id,type:id==='default'?'front':id,additional_price:null}))}}};
 if(path.includes('/prices'))return {data:{currency:'USD',variant:{id:4011,techniques:[{technique_key:'dtg',price:cost}]},product:{id:71,placements:['front','back','sleeve_right'].map(id=>({id,technique_key:'dtg',price:id==='sleeve_right'?'3.25':'5.00',layers:[{type:'file',additional_price:'0.00'}]}))}}};
 if(path.includes('/availability'))return {data:{techniques:[{technique:'dtg',selling_regions:[{name:'north_america',availability:'in stock'}]}]}};
 if(path==='/v2/catalog-products/71')return {data:{id:71,placements:['front','back','sleeve_right'].map(placement=>({placement,technique:'dtg'}))}};
 throw Error('unexpected '+path);
 }};
 return {manifest,input,deps,calls,setCost:c=>cost=c,change:fn=>fn(remote)};
}
test('preview uses saved artwork and catalog combined quote without supplier writes',async()=>{
 const f=fixture(),p=await buildPlacementPreview(f.manifest,f.input,f.deps);
 assert.equal(p.variants[0].quote.productionBaseCents,2325);assert.equal(p.variants[0].files[1].assetId,'b');
 assert.ok(!f.calls.some(c=>c.init.method==='PUT'));assert.ok(!JSON.stringify(p).includes('signed.example'));
});
test('approved plan writes exact back and sleeve, verifies provider readbacks and refreshes combined quote',async()=>{
 const f=fixture(),p=await buildPlacementPreview(f.manifest,f.input,f.deps),evidence=[];
 const result=await applyPlacementPreview(f.manifest,p,f.deps,async(...args)=>evidence.push(args));
 assert.equal(result.state,'PLACEMENT_FILES_VERIFIED');assert.deepEqual(result.verifiedVariantIds,['v']);assert.equal(evidence[0][1].productionBaseCents,2325);
 const body=JSON.parse(f.calls.find(c=>c.init.method==='PUT').init.body);assert.deepEqual(body.files.map(f=>f.type),['back','sleeve_right']);assert.ok(!('retail_price' in body));assert.ok(!('sku' in body));
});
test('changed prices, canonical records and supplier options require a fresh preview before writes',async()=>{
 for(const mutate of [f=>f.setCost('22.00'),f=>f.manifest.assets[0].fileName='other.png',f=>f.change(r=>r.options=[{id:'notes',value:'changed'}])]){
 const f=fixture(),p=await buildPlacementPreview(f.manifest,f.input,f.deps);mutate(f);
 await assert.rejects(applyPlacementPreview(f.manifest,p,f.deps,async()=>{}));assert.ok(!f.calls.some(c=>c.init.method==='PUT'));
 }
});
test('missing variants, wrong assets, duplicate placements and out of bounds dimensions fail before writes',async()=>{
 for(const mutate of [f=>f.input.variants=[],f=>f.input.variants[0].files[0].assetId='foreign',f=>f.input.variants[0].files[1].type='back',f=>f.input.variants[0].files[0].position={...position,left:1700}]){
 const f=fixture();mutate(f);await assert.rejects(buildPlacementPreview(f.manifest,f.input,f.deps));assert.ok(!f.calls.some(c=>c.init.method==='PUT'));
 }
});
test('successful PUT with wrong artwork or unfinished files is not verified',async()=>{
 for(const change of [r=>r.files[0].hash='wrong',r=>r.files[0].width=0,r=>r.files[0].status='waiting']){
 const f=fixture(),p=await buildPlacementPreview(f.manifest,f.input,f.deps),request=f.deps.request;
 f.deps.request=async(...args)=>{const r=await request(...args);if(args[2]?.method==='PUT')f.change(change);return r;};
 const result=await applyPlacementPreview(f.manifest,p,f.deps,async()=>assert.fail('must not save evidence'));
 assert.equal(result.state,'NEEDS_REVIEW');assert.deepEqual(result.verifiedVariantIds,[]);assert.equal(result.errorCode,'printful_placement_verification_failed');
 }
});
test('sync request uses documented file fields and never sends position offsets',async()=>{
 const f=fixture(),p=await buildPlacementPreview(f.manifest,f.input,f.deps);
 await applyPlacementPreview(f.manifest,p,f.deps,async()=>{});
 const body=JSON.parse(f.calls.find(c=>c.init.method==='PUT').init.body);
 assert.ok(body.files.every(f=>!('position' in f)&&!('canvas' in f)&&!('assetId' in f)));
});
test('a later variant failure retains only verified progress and never reports the whole product ready',async()=>{
 const f=fixture();f.manifest.variants.push({...f.manifest.variants[0],id:'v2',etsyProductId:'457',etsySku:'SM-2'});
 f.input.variants.push({...f.input.variants[0],variantId:'v2'});
 const request=f.deps.request,get=f.deps.get;
 f.deps.request=async(path,store,init={})=>{
 if(path==='/sync/variant/302'){
  if(init.method==='PUT')throw Error('printful_http_429');
  return {result:{sync_variant:{id:302,sync_product_id:101,synced:false,files:[]}}};
 }
 const r=await request(path,store,init);
 if(path.startsWith('/sync/products/'))r.result.sync_variants.push({id:302,external_id:'457',sku:'SM-2'});
 return r;
 };
 f.deps.get=async(path,store)=>path==='/sync/variant/302'?f.deps.request(path,store):get(path,store);
 const p=await buildPlacementPreview(f.manifest,f.input,f.deps),saved=[];
 const result=await applyPlacementPreview(f.manifest,p,f.deps,async id=>saved.push(id));
 assert.equal(result.state,'NEEDS_REVIEW');assert.equal(result.errorCode,'printful_http_429');assert.deepEqual(saved,['v']);assert.deepEqual(result.verifiedVariantIds,['v']);
});
