import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { imagePlan } from '../lib/warlock-commerce/listing-images.ts';
import { buildDraftImportPreview, validateDraftImportPreview, draftImportPreviewSchema, draftImportApplySchema, safeDraftImportError, draftImportErrorDetails } from '../lib/warlock-commerce/etsy-draft-import.ts';
function fixture(digital=false,existing=true,count=30){
 const target={listing_id:20,shop_id:99,state:'draft',listing_type:digital?'download':'physical',title:'New Etsy title',description:'Remote copy',tags:['art'],taxonomy_id:123,quantity:7,who_made:'i_did',when_made:'2020_2026',is_supply:false,should_auto_renew:false,shop_section_id:12,shipping_profile_id:digital?null:13,readiness_state_id:null,production_partner_ids:[],price:{amount:2900,divisor:100,currency_code:'USD'}};
 const inventory={products:Array.from({length:count},(_,n)=>({product_id:100+n,sku:'',property_values:[{property_id:513,values:[`Color ${n}`]},{property_id:514,values:['M']}],offerings:[{is_enabled:n!==0,is_deleted:false,quantity:n,price:{amount:2900+n,divisor:100,currency_code:'USD'}}]}))};
 const listing={id:'l',fulfillment:digital?'DIGITAL':'PHYSICAL',etsyListingId:'10',title:'Old title',description:'Old copy',assets:[],etsyAdsEnabled:false};
 const product=existing?{id:'p',title:'Keep product title',collection:'Keep collection',description:'Keep product copy',notes:'Keep notes',assets:[{id:'a',role:'mockup'}],listings:[listing,{id:'sibling',fulfillment:digital?'PHYSICAL':'DIGITAL',etsyListingId:'50',assets:[]}],variants:[{id:'old',fulfillment:listing.fulfillment,label:'Old variant',etsyListingId:'10',printfulVariantId:999,retailPriceCents:9900},{id:'sibling-v',fulfillment:digital?'PHYSICAL':'DIGITAL',etsyListingId:'50'}]}:null;
 const input={productId:existing?'p':null,expectedEtsyListingId:existing?'10':null,etsyListingId:'20',collection:'Spellmark'};
 let sourceExists=false;const calls=[];
 const read=async path=>{calls.push(path);if(path.includes('?state=draft'))return {count:1,results:[{shop_id:99}]};if(path==='/listings/10'){if(sourceExists)return {state:'inactive'};throw Error('etsy_http_404');}if(path.includes('inventory'))return structuredClone(inventory);if(path==='/listings/20')return structuredClone(target);throw Error('unexpected');};
 return {target,inventory,product,input,read,calls,setSourceExists:()=>sourceExists=true};
}
test('30 remote variants replace six/one canonical candidates without SKU or supplier guesses',async()=>{
 const f=fixture(),before=structuredClone(f.product),p=await buildDraftImportPreview(f.product,f.input,99,f.read);
 assert.equal(p.snapshot.variants.length,30);assert.equal(p.snapshot.listing.title,'New Etsy title');assert.equal(p.snapshot.previous.variants.length,1);
 assert.equal(p.snapshot.variants[0].etsySku,null);assert.equal(p.snapshot.variants[0].enabled,false);assert.equal(p.snapshot.variants[29].retailPriceCents,2929);
 assert.equal(p.snapshot.variants[0].label,'Color 0 / M');assert.equal(p.snapshot.variants[0].printfulVariantId,undefined);assert.deepEqual(f.product,before);
});
test('new digital import needs no intake/assets/master and retains copy with explicit disclosure warning',async()=>{
 const f=fixture(true,false),p=await buildDraftImportPreview(null,f.input,99,f.read);
 assert.equal(p.canonicalFingerprint,null);assert.equal(p.snapshot.variants.length,1);assert.equal(p.snapshot.variants[0].retailPriceCents,2900);
 assert.equal(p.snapshot.listing.description,'Remote copy');assert.equal(p.snapshot.listing.productionPartnerId,null);assert.ok(p.snapshot.warnings.some(w=>w.startsWith('AI_DISCLOSURE_MISSING')));
 assert.ok(!f.calls.some(p=>p.includes('inventory')));
});
test('owned draft identity, complete inventory and USD price are mandatory',async()=>{
 for(const mutate of [f=>f.target.state='inactive',f=>f.target.shop_id=100,f=>f.target.listing_id=21,f=>f.inventory.products=[],f=>f.inventory.products[1].product_id=100,f=>f.inventory.products[0].offerings.push(structuredClone(f.inventory.products[0].offerings[0])),f=>f.inventory.products[0].offerings[0].price.currency_code='EUR',f=>f.inventory.products[0].offerings[0].price.divisor=0,f=>f.target.quantity=-1]){
  const f=fixture();mutate(f);await assert.rejects(buildDraftImportPreview(f.product,f.input,99,f.read));
 }
});
test('source still present and auth/permission/network failure cannot authorize replacement',async()=>{
 const f=fixture();f.setSourceExists();await assert.rejects(buildDraftImportPreview(f.product,f.input,99,f.read),/source_still_exists/);
 for(const code of ['etsy_http_401','etsy_http_403','etsy_http_429','etsy_http_500'])await assert.rejects(buildDraftImportPreview(f.product,f.input,99,()=>Promise.reject(Error(code))),new RegExp(code));
});
test('expiry and drift of copy/inventory/canonical state invalidate approval',async()=>{
 for(const mutate of [(f,p)=>p.expiresAt=new Date(0).toISOString(),f=>f.target.title='changed',f=>f.inventory.products[0].offerings[0].quantity=42,f=>f.product.variants[0].retailPriceCents=111]){
  const f=fixture(),p=await buildDraftImportPreview(f.product,f.input,99,f.read);mutate(f,p);await assert.rejects(validateDraftImportPreview(f.product,p,99,f.read));
 }
});
test('source must be exact; importing already-linked same draft is possible with explicit identity',async()=>{
 const f=fixture();f.input.expectedEtsyListingId=null;await assert.rejects(buildDraftImportPreview(f.product,f.input,99,f.read),/source_identity_changed/);
 f.input.expectedEtsyListingId='20';f.product.listings[0].etsyListingId='20';f.product.variants[0].etsyListingId='20';
 assert.equal((await buildDraftImportPreview(f.product,f.input,99,f.read)).snapshot.variants.length,30);
});
test('digital canonical partner is none; malformed shop probe and unconfirmed input fail closed',async()=>{
 const f=fixture(true);f.product.listings[0].productionPartnerId='123';const digital=await buildDraftImportPreview(f.product,f.input,99,f.read);assert.equal(digital.snapshot.listing.productionPartnerId,null);assert.ok(digital.snapshot.warnings.some(w=>w.includes('PRODUCTION_PARTNER')));
 const g=fixture();await assert.rejects(buildDraftImportPreview(g.product,g.input,99,async p=>p.includes('?state=')?{count:1,results:[]}:g.read(p)),/shop_access_not_verified/);
 assert.throws(()=>draftImportApplySchema.parse({previewId:'x',confirmImport:false}));assert.throws(()=>draftImportPreviewSchema.parse({etsyListingId:'20'}));
 assert.equal(safeDraftImportError(Error('private token https://secret')),'etsy_import_failed');
});
// Real executor with transactional repository mocks, not a reimplementation of import logic.
const db={product:null,previews:[],journals:[],occupied:[],read:null};globalThis.__draftImportDb=db;
db.spellmarkDraftImportPreview={create:async({data})=>{const p={id:'preview-'+(db.previews.length+1),resultJson:null,...data};db.previews.push(p);return p;},findUnique:async({where})=>structuredClone(db.previews.find(p=>p.id===where.id)??null),update:async({where,data})=>Object.assign(db.previews.find(p=>p.id===where.id),data)};
db.spellmarkProduct={create:async({data})=>db.product={id:'new-product',...data,assets:[],variants:[],listings:[]}};
db.spellmarkListing={findMany:async({where})=>db.occupied.includes(where.etsyListingId)?[{productId:'other',fulfillment:'PHYSICAL'}]:(db.product?.listings.filter(l=>l.etsyListingId===where.etsyListingId).map(l=>({productId:db.product.id,fulfillment:l.fulfillment}))??[]),
 upsert:async({where,create,update})=>{let l=db.product.listings.find(l=>l.fulfillment===where.productId_fulfillment.fulfillment);if(l)Object.assign(l,update);else{l={id:'new-listing',assets:[],...create};db.product.listings.push(l);}return l;}};
db.spellmarkVariant={findMany:async({where})=>db.product?.variants.filter(v=>v.etsyListingId===where.etsyListingId).map(v=>({productId:db.product.id,fulfillment:v.fulfillment}))??[],deleteMany:async({where})=>{db.product.variants=db.product.variants.filter(v=>v.fulfillment!==where.fulfillment);},createMany:async({data})=>{db.product.variants.push(...data.map((v,n)=>({id:'new-v'+n,...v})));}};
db.spellmarkListingAsset={updateMany:async({where,data})=>{for(const l of db.product.listings)if(l.id===where.listingId)for(const a of l.assets)Object.assign(a,data);}};
db.spellmarkJournal={create:async({data})=>{if(db.failJournal)throw Error('db failed');db.journals.push(data);return data;}};
db.$queryRaw=async()=>[];db.$transaction=async fn=>{const old=structuredClone({product:db.product,previews:db.previews,journals:db.journals});try{return await fn(db);}catch(e){Object.assign(db,old);throw e;}};
const hooks=registerHooks({resolve(s,c,next){if(c.parentURL?.endsWith('/etsy-draft-import-executor.ts')){const stubs={'../prisma':'export const prisma=globalThis.__draftImportDb;','../warlock-mcp/repository':'export async function findWarlockProduct(){return structuredClone(globalThis.__draftImportDb.product);}','../warlock-auth':'export async function getWarlockEtsyOperatorContext(){return {shopId:99,auth:{session:{access_token:"test"}}};}','./etsy-reconciliation-read':'export const readEtsyForReconciliation=(_token,path)=>globalThis.__draftImportDb.read(path);'};if(stubs[s])return {url:'data:text/javascript,'+encodeURIComponent(stubs[s]),shortCircuit:true};}return next(s,c);}});
const {previewEtsyDraftImport,applyEtsyDraftImport}=await import('../lib/warlock-commerce/etsy-draft-import-executor.ts');hooks.deregister();
function setup(f){db.product=structuredClone(f.product);db.previews=[];db.journals=[];db.occupied=[];db.failJournal=false;db.read=f.read;}
test('executor creates missing canonical product atomically and retry never contacts Etsy or duplicates',async()=>{
 const f=fixture(false,false,25);setup(f);const p=await previewEtsyDraftImport(f.input);assert.equal(db.product,null);
 const r=await applyEtsyDraftImport({previewId:p.previewId,confirmImport:true});assert.equal(r.variantCount,25);assert.equal(r.productId,'new-product');assert.equal(r.etsyMutated,false);
 assert.equal(db.product.listings[0].etsyListingId,'20');assert.equal(db.product.listings[0].status,'DRAFT_CREATED');assert.equal(db.product.variants.length,25);
 db.read=()=>{throw Error('no retry network');};const retry=await applyEtsyDraftImport({previewId:p.previewId,confirmImport:true});assert.equal(retry.reused,true);assert.equal(db.journals.length,1);
});
test('executor replaces selected inventory/copy, archives supplier evidence and preserves files/metadata/sibling',async()=>{
 const f=fixture();f.product.listings[0].assets=[{id:'asset-link',asset:{id:'a'},etsyRemoteId:'77'}];setup(f);const before=structuredClone(db.product),p=await previewEtsyDraftImport(f.input);
 await applyEtsyDraftImport({previewId:p.previewId,confirmImport:true});assert.equal(db.product.variants.filter(v=>v.fulfillment==='PHYSICAL').length,30);
 assert.equal(db.product.listings[0].title,'New Etsy title');assert.equal(db.product.listings[0].assets[0].etsyRemoteId,null);assert.equal(db.product.listings[0].etsyAdsEnabled,false);
 assert.equal(db.product.title,before.title);assert.equal(db.product.collection,before.collection);assert.deepEqual(db.product.assets,before.assets);
 assert.deepEqual(db.product.listings[1],before.listings[1]);assert.deepEqual(db.product.variants.find(v=>v.id==='sibling-v'),before.variants[1]);
 assert.equal(db.product.variants.find(v=>v.fulfillment==='PHYSICAL').printfulVariantId,undefined);
 assert.equal(JSON.parse(db.journals[0].bodyJson).archive.variants[0].printfulVariantId,999);
});
test('duplicate target before/after preview, expired approval, canonical and remote drift refuse all writes',async()=>{
 const f=fixture();setup(f);db.occupied=['20'];await assert.rejects(previewEtsyDraftImport(f.input),/already_linked/);
 for(const mutate of [()=>db.occupied=['20'],()=>db.product.notes='changed',()=>f.target.title='changed',()=>{const p=JSON.parse(db.previews[0].bodyJson);p.expiresAt=new Date(0).toISOString();db.previews[0].bodyJson=JSON.stringify(p);}]){
  const g=fixture();setup(g);const p=await previewEtsyDraftImport(g.input);const before=structuredClone(db.product);if(mutate.toString().includes('f.target'))g.target.title='changed';else mutate();
  await assert.rejects(applyEtsyDraftImport({previewId:p.previewId,confirmImport:true}));assert.equal(db.journals.length,0);assert.equal(db.product.variants.length,before.variants.length);
 }
});
test('DB failure rolls back variant deletion, listing replacement, evidence and approval result together',async()=>{
 const f=fixture();setup(f);const p=await previewEtsyDraftImport(f.input),before=structuredClone(db.product);db.failJournal=true;
 await assert.rejects(applyEtsyDraftImport({previewId:p.previewId,confirmImport:true}),/db failed/);assert.deepEqual(db.product,before);assert.equal(db.previews[0].resultJson,null);
});

 test('imported draft accepts the existing approved mockup edit path without commerce creation gates',async()=>{
 const f=fixture();f.product.assets=[{id:'a',role:'mockup',contentType:'image/png',fileName:'approved.png'}];setup(f);
 const p=await previewEtsyDraftImport(f.input);await applyEtsyDraftImport({previewId:p.previewId,confirmImport:true});
 const snapshot={etsyListingId:'20',shopId:99,state:'draft',images:[],imagesFingerprint:'approved-current-images'};
 const plan=imagePlan(db.product,{productId:'p',fulfillment:'PHYSICAL',assetId:'a',rank:1,expectedImageId:null,expectedImagesFingerprint:snapshot.imagesFingerprint},snapshot);
 assert.equal(plan.listing.etsyListingId,'20');assert.equal(plan.asset.id,'a');assert.equal(db.product.listings[0].status,'DRAFT_CREATED');
 });

test('active digital and physical imports record state and support image edits without changing Etsy',async()=>{
 for(const digital of [true,false]) {
  const f=fixture(digital,false,2);f.target.state='active';setup(f);
  const p=await previewEtsyDraftImport(f.input);assert.equal(p.preview.snapshot.remoteState,'active');
  const r=await applyEtsyDraftImport({previewId:p.previewId,confirmImport:true});
  assert.equal(r.state,'ETSY_ACTIVE_LISTING_IMPORTED');assert.equal(r.remoteState,'active');assert.equal(r.etsyMutated,false);assert.equal(r.published,false);
  assert.equal(JSON.parse(db.product.listings[0].observationJson).snapshot.remoteState,'active');
  db.product.assets.push({id:'mockup',role:'mockup',contentType:'image/png'});
  const snapshot={etsyListingId:'20',shopId:99,state:'active',images:[],imagesFingerprint:'current'};
  assert.equal(imagePlan(db.product,{productId:r.productId,fulfillment:r.fulfillment,assetId:'mockup',rank:1,expectedImageId:null,expectedImagesFingerprint:'current'},snapshot).listing.etsyListingId,'20');
 }
});
test('active import approval rejects state changes before canonical writes',async()=>{
 const f=fixture(true,false);f.target.state='active';setup(f);const p=await previewEtsyDraftImport(f.input);f.target.state='draft';
 await assert.rejects(applyEtsyDraftImport({previewId:p.previewId,confirmImport:true}),/remote_changed/);assert.equal(db.product,null);
});

test('numeric diagnostics identify original inventory indexes and variant without coercing values',async()=>{
 const f=fixture();f.inventory.products.unshift({is_deleted:true});
 f.inventory.products[1].offerings.unshift({is_deleted:true});
 f.inventory.products[1].offerings[1].price.amount='2900';
 await assert.rejects(buildDraftImportPreview(f.product,f.input,99,f.read),e=>{
  assert.equal(safeDraftImportError(e),'etsy_import_invalid_integer');
  assert.deepEqual(draftImportErrorDetails(e).validation,{field:'inventory.products[1].offerings[1].price.amount',etsyProductId:'100',value:'2900',receivedType:'string',expected:{type:'number',integer:true,minimum:1,maximum:2147483647}});return true;
 });
});
test('numeric diagnostics cover listing fields and redact arbitrary remote content',async()=>{
 for(const [field,value] of [['quantity',-1],['taxonomy_id',null],['quantity','https://private.example/token']]){
  const f=fixture();f.target[field]=value;
  await assert.rejects(buildDraftImportPreview(f.product,f.input,99,f.read),e=>{const d=draftImportErrorDetails(e).validation;assert.equal(d.field,'listing.'+field);assert.equal(d.value,typeof value==='string'?'[redacted]':value);return true;});
 }
 assert.deepEqual(draftImportErrorDetails(Error('secret')),{});
});
