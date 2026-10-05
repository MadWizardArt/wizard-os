import test from 'node:test';
import assert from 'node:assert/strict';
import {storedSyncId, exposedSyncId} from '../lib/warlock-commerce/sync-id-storage.ts';
import {printfulSyncPersistence} from '../lib/warlock-commerce/printful-sync-persistence.ts';
import {configureImportedPrintful} from '../lib/warlock-commerce/printful-sync-service.ts';
import {printfulSyncRequest} from '../lib/warlock-commerce/printful-import.ts';
const manifest={id:'p1',variants:[{id:'v1',fulfillment:'PHYSICAL',printfulStoreId:99,printfulVariantId:4011,etsySku:'SM-1',etsyProductId:'2001',printfulSyncVariantId:null,retailPriceCents:3000}],listings:[{id:'l1',fulfillment:'PHYSICAL',etsyListingId:'4586039819'}],assets:[{role:'master',contentType:'image/png',fileName:'art.png'}]};
function fixture(){const calls=[];let saved;return {calls,deps:{request:async(path,store,init={})=>{calls.push(['request',path,init]);if(init.method==='PUT'){const body=JSON.parse(init.body);saved={id:5000000001,sync_product_id:4000000001,synced:true,variant_id:body.variant_id,files:body.files.map((f,i)=>({...f,id:i+1,status:'ok'}))};return {result:{}};} return path.startsWith('/sync/variant/')?{result:{sync_variant:saved ?? {id:5000000001,sync_product_id:4000000001,synced:false,files:[]}}}:{result:{sync_product:{id:4000000001,external_id:'4586039819'},sync_variants:[{id:5000000001,external_id:'2001',sku:'SM-1'}]}};},temporaryAsset:async()=>({url:'https://signed.example/art.png'}),saveListing:async()=>{},saveVariant:async()=>{}}};}
test('sync IDs beyond signed int32 retain exact digits in storage and the numeric MCP contract',()=>{
 for(const id of [301,2147483648,4000000001,5000000001,Number.MAX_SAFE_INTEGER])assert.equal(exposedSyncId(storedSyncId(id)),id);
 assert.equal(exposedSyncId(null),null);for(const id of [0,-1,Number.MAX_SAFE_INTEGER+1,1.5])assert.throws(()=>storedSyncId(id));for(const id of ['1e3','9007199254740992','-1'])assert.throws(()=>exposedSyncId(id));
});
test('shared Prisma persistence writes opaque sync IDs as strings rather than overflowing integer inputs',async()=>{
 let variant,listing;const db={spellmarkListing:{update:async v=>listing=v},spellmarkVariant:{update:async v=>variant=v}};
 const f=fixture();Object.assign(f.deps,printfulSyncPersistence(db));assert.equal((await configureImportedPrintful(manifest,f.deps)).state,'SYNCED');assert.equal(variant.data.printfulSyncVariantId,'5000000001');assert.equal(listing.data.printfulSyncProductId,'4000000001');assert.ok(!('retailPriceCents'in variant.data));
});
test('database failures return the exact persistence stage and sanitized Prisma code before any configuration',async()=>{
 for(const stage of ['SAVE_SYNC_PRODUCT','SAVE_SYNC_VARIANT','SAVE_SYNC_COMPLETION']){
  const f=fixture();let listingSaves=0;f.deps.saveListing=async()=>{listingSaves++;if(stage==='SAVE_SYNC_PRODUCT'||(stage==='SAVE_SYNC_COMPLETION'&&listingSaves===2))throw Object.assign(Error('secret database connection'),{code:'P2020'});};f.deps.saveVariant=async()=>{if(stage==='SAVE_SYNC_VARIANT')throw Object.assign(Error('secret db'),{name:'PrismaClientValidationError'});};
  const r=await configureImportedPrintful(manifest,f.deps);assert.equal(r.state,'BLOCKED');assert.equal(r.diagnostic.stage,stage);assert.match(r.errorCode,/persistence_failed/);assert.equal(r.diagnostic.causeCode,stage==='SAVE_SYNC_VARIANT'?'database_validation_failed':'prisma_P2020');assert.ok(!JSON.stringify(r).includes('secret'));if(stage!=='SAVE_SYNC_COMPLETION')assert.ok(!f.calls.some(c=>c[2]?.method==='PUT'));
 }
});
test('asset signing failure retains imported IDs and returns asset stage rather than generic reconciliation failure',async()=>{
 const f=fixture();let saved=0;f.deps.saveVariant=async()=>saved++;f.deps.temporaryAsset=async()=>{throw Error('signed URL private secret')};const r=await configureImportedPrintful(manifest,f.deps);assert.equal(saved,1);assert.equal(r.errorCode,'printful_asset_signing_failed');assert.equal(r.diagnostic.stage,'SIGN_MASTER_ASSET');assert.equal(r.diagnostic.variantId,'v1');assert.ok(!JSON.stringify(r).includes('secret'));
});
test('Printful rejection exposes its sanitized message and configuration stage without credentials or signed URLs',async()=>{
 const oldFetch=globalThis.fetch,oldToken=process.env.PRINTFUL_PRIVATE_TOKEN;process.env.PRINTFUL_PRIVATE_TOKEN='private-fixture-token';
 try{globalThis.fetch=async()=>Response.json({error:{message:'File rejected https://signed.example/art?signature=secret Bearer private-fixture-token'}},{status:400});let error;try{await printfulSyncRequest('/sync/variant/5000000001',99,{method:'PUT'})}catch(e){error=e;}
 const f=fixture(),request=f.deps.request;f.deps.request=async(...args)=>{if(args[2]?.method==='PUT')throw error;return request(...args);};const r=await configureImportedPrintful(manifest,f.deps);assert.equal(r.errorCode,'printful_http_400');assert.equal(r.diagnostic.stage,'CONFIGURE_SYNC_VARIANT');assert.match(r.diagnostic.providerMessage,/File rejected/);assert.ok(!JSON.stringify(r).includes('signed.example'));assert.ok(!JSON.stringify(r).includes('private-fixture-token'));assert.ok(!JSON.stringify(r).includes('signature=secret'));
 }finally{globalThis.fetch=oldFetch;if(oldToken===undefined)delete process.env.PRINTFUL_PRIVATE_TOKEN;else process.env.PRINTFUL_PRIVATE_TOKEN=oldToken;}
});
