import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectPrintfulImport, printfulSyncRequest } from '../lib/warlock-commerce/printful-import.ts';
import { configureImportedPrintful } from '../lib/warlock-commerce/printful-sync-service.ts';
const variants = [1,2].map(n=>({id:'v'+n,fulfillment:'PHYSICAL',printfulStoreId:99,printfulVariantId:4000+n,etsySku:'SM-'+n,etsyProductId:'200'+n,printfulSyncVariantId:null,retailPriceCents:3000}));
const manifest = {id:'p1',variants,listings:[{id:'l1',fulfillment:'PHYSICAL',etsyListingId:'4586039819'}],assets:[{id:'a1',role:'master',fileName:'design.png'}]};
const imported=()=>({result:{sync_product:{id:101,external_id:'4586039819'},sync_variants:variants.map((v,n)=>({id:301+n,external_id:v.etsyProductId,sku:v.etsySku}))}});
function dependencies(payload=imported()) {
 const calls=[];
 const deps={request:async(path,store,init={},allow404)=>{calls.push({kind:'request',path,store,init,allow404});return init.method==='PUT'?{result:{}}:payload;},
 temporaryAsset:async()=>{calls.push({kind:'asset'});return {url:'https://signed.example/design.png'};},
 saveListing:async(id,data)=>calls.push({kind:'listing',id,data}),saveVariant:async(id,data)=>calls.push({kind:'variant',id,data})};
 return {deps,calls};
}
test('missing Etsy import returns timestamp, store prerequisite and recovery; inspection performs only one live GET',async()=>{
 const {deps,calls}=dependencies(null);const result=await inspectPrintfulImport(manifest,deps.request);
 assert.equal(result.state,'AWAITING_PRINTFUL_IMPORT');assert.equal(result.etsyListingId,'4586039819');assert.equal(result.storeId,99);assert.ok(Number.isFinite(Date.parse(result.checkedAt)));
 assert.equal(result.importPrerequisite.verification,'MANUAL_CHECK_REQUIRED');assert.match(result.nextAction,/Refresh data/);assert.match(result.nextAction,/daily/);assert.match(result.nextAction,/cannot distinguish/);
 assert.equal(calls.length,1);assert.equal(calls[0].path,'/sync/products/@4586039819');assert.equal(calls[0].allow404,true);assert.deepEqual(calls[0].init,{});
});
test('wait result persists listing status without uploading or configuring any supplier variant',async()=>{
 const {deps,calls}=dependencies(null);assert.equal((await configureImportedPrintful(manifest,deps)).state,'AWAITING_PRINTFUL_IMPORT');
 assert.deepEqual(calls.map(c=>c.kind),['request','listing']);assert.equal(calls[1].data.status,'WAITING_PRINTFUL');
});
test('imported IDs save before configuration and complete exact mappings reach review-ready sync',async()=>{
 const {deps,calls}=dependencies();const inspected=await inspectPrintfulImport(manifest,deps.request);assert.equal(inspected.state,'IMPORTED');assert.equal(calls.length,1);calls.length=0;
 const result=await configureImportedPrintful(manifest,deps);assert.equal(result.state,'SYNCED');assert.equal(result.printfulSyncProductId,101);assert.deepEqual(result.configuredVariantIds,['v1','v2']);
 assert.deepEqual(calls.slice(0,4).map(c=>c.kind),['request','listing','variant','variant']);assert.equal(calls[1].data.printfulSyncProductId,101);
 const puts=calls.filter(c=>c.init?.method==='PUT');assert.equal(puts.length,2);assert.equal(puts[0].path,'/sync/variant/301');assert.equal(JSON.parse(puts[0].init.body).variant_id,4001);assert.equal(JSON.parse(puts[0].init.body).retail_price,'30.00');assert.equal(calls.at(-1).data.status,'SYNCED');
});
test('missing, duplicated, conflicting and reused sync variant identities block all supplier configuration',async()=>{
 const missing=imported();missing.result.sync_variants.pop();
 const duplicate=imported();duplicate.result.sync_variants.push({...duplicate.result.sync_variants[0],id:900});
 const conflict=structuredClone(manifest);conflict.variants[0].printfulSyncVariantId=999;
 const reuse=structuredClone(manifest);reuse.variants[1]={...reuse.variants[0],id:'v2'};
 for(const [m,p] of [[manifest,missing],[manifest,duplicate],[conflict,imported()],[reuse,imported()]]){
  const {deps,calls}=dependencies(p);const r=await configureImportedPrintful(m,deps);assert.equal(r.state,'VARIANT_MAPPING_FAILED');assert.ok(r.unmatchedVariantIds.length);assert.ok(!calls.some(c=>c.init?.method==='PUT'||c.kind==='asset'));assert.equal(calls[1].data.status,'PRINTFUL_MAPPING_FAILED');
  if(m===reuse){assert.equal(r.variants.length,0);assert.deepEqual(new Set(r.unmatchedVariantIds),new Set(['v1','v2']));}
 }
});
test('malformed responses, wrong external product and API errors are distinct from an import delay',async()=>{
 for(const payload of [{result:{}},{result:{sync_product:{id:101,external_id:'wrong'},sync_variants:[]}}]){
  const {deps}=dependencies(payload);assert.equal((await inspectPrintfulImport(manifest,deps.request)).state,'PRINTFUL_API_ERROR');
 }
 for(const code of ['printful_http_401','printful_http_429','upstream secret url']){
  const r=await inspectPrintfulImport(manifest,async()=>{throw Error(code)});assert.equal(r.state,'PRINTFUL_API_ERROR');assert.equal(r.errorCode,code.startsWith('printful_http_')?code:'printful_request_failed');assert.ok(!JSON.stringify(r).includes('secret'));
 }
});
test('configuration API failure retains discovered identity and partial progress; retry uses saved IDs',async()=>{
 const {deps,calls}=dependencies();const original=deps.request;deps.request=async(...args)=>{if(args[0]==='/sync/variant/302')throw Error('printful_http_429');return original(...args)};
 const r=await configureImportedPrintful(manifest,deps);assert.equal(r.state,'PRINTFUL_API_ERROR');assert.equal(r.errorCode,'printful_http_429');assert.deepEqual(r.configuredVariantIds,['v1']);assert.equal(r.etsyListingId,'4586039819');assert.equal(r.printfulSyncProductId,101);assert.equal(calls.filter(c=>c.kind==='variant').length,2);assert.ok(!calls.some(c=>c.data?.status==='SYNCED'));
 const retry=structuredClone(manifest);retry.variants.forEach((v,n)=>v.printfulSyncVariantId=301+n);
 assert.equal((await configureImportedPrintful(retry,dependencies().deps)).state,'SYNCED');
});
test('missing draft, mixed stores and digital-only products avoid external calls',async()=>{
 const missing=structuredClone(manifest);missing.listings[0].etsyListingId=null;
 const mixed=structuredClone(manifest);mixed.variants[1].printfulStoreId=null;
 const digital={...manifest,variants:[{fulfillment:'DIGITAL'}]};
 for(const [m,state] of [[missing,'BLOCKED'],[mixed,'BLOCKED'],[digital,'SKIPPED']]){const {deps,calls}=dependencies();assert.equal((await inspectPrintfulImport(m,deps.request)).state,state);assert.equal(calls.length,0);}
});
test('transport treats only lookup 404 as absent, isolates store, disables caching/redirects and sanitizes errors',async()=>{
 const oldFetch=globalThis.fetch,oldToken=process.env.PRINTFUL_PRIVATE_TOKEN;process.env.PRINTFUL_PRIVATE_TOKEN='fixture-only';
 try{
  globalThis.fetch=async(url,options)=>{assert.equal(url,'https://api.printful.com/sync/products/@4586039819');assert.equal(options.headers['X-PF-Store-Id'],'99');assert.equal(options.cache,'no-store');assert.equal(options.redirect,'error');return new Response('upstream secret',{status:404});};
  assert.equal(await printfulSyncRequest('/sync/products/@4586039819',99,{},true),null);
  await assert.rejects(printfulSyncRequest('/sync/products/@4586039819',99),/^Error: printful_http_404$/);
  globalThis.fetch=async()=>new Response('secret',{status:403});await assert.rejects(printfulSyncRequest('/sync/products/@4586039819',99,{},true),/^Error: printful_http_403$/);
  globalThis.fetch=async()=>new Response('secret');await assert.rejects(printfulSyncRequest('/sync/products/@4586039819',99),/^Error: printful_invalid_response$/);
 }finally{globalThis.fetch=oldFetch;if(oldToken===undefined)delete process.env.PRINTFUL_PRIVATE_TOKEN;else process.env.PRINTFUL_PRIVATE_TOKEN=oldToken;}
});
