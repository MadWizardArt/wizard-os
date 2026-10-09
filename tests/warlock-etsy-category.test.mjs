import test from 'node:test';import assert from 'node:assert/strict';import {registerHooks} from 'node:module';
import {etsyTaxonomyId,categoryApplySchema,safeCategoryError,categoryErrorDetails} from '../lib/warlock-commerce/etsy-listing-category.ts';
const db={taxonomy:[{id:456,name:'Wall Decor',level:0,parent_id:null,children:[]}],inventory:{products:[{product_id:1,offerings:[{price:{amount:0,divisor:100,currency_code:'USD'},is_enabled:false}]}]},inventoryDrift:false,product:null,journals:[],remote:null,writes:0,mode:true,unknown:false,failFinalize:false};globalThis.__categoryDb=db;

// Only the network boundary is mocked: category executor uses both real HTTP transports.
const requests=[];
async function etsyFetch(url,args){
 requests.push({url,method:args.method});
 const path=String(url).replace('https://api.etsy.com/v3/application','');
 if(args.method==='GET'){
  const payload=path==='/seller-taxonomy/nodes'?{results:db.taxonomy}:path==='/listings/20/inventory?legacy=false'?db.inventory:path==='/listings/20'?db.remote:null;
  if(!payload)throw Error('unexpected GET '+path);
  return Response.json(structuredClone(payload));
 }
 assert.equal(path,'/shops/99/listings/20');assert.equal(args.method,'PATCH');assert.deepEqual([...args.body.keys()],['taxonomy_id']);
 const taxonomyId=Number(args.body.get('taxonomy_id'));
 const intent=JSON.parse(db.journals.find(j=>j.kind==='ETSY_CATEGORY_CHANGE').bodyJson);
 assert.equal(intent.state,'SENDING');assert.equal(db.product.listings[0].taxonomyId,taxonomyId);
 db.writes++;db.remote.taxonomy_id=taxonomyId;if(db.inventoryDrift)db.inventory.products[0].product_id=2;db.remote.last_modified_timestamp++;
 if(db.unknown)throw Error('network failure');
 return Response.json({});
}
function setup(state='active',fulfillment='DIGITAL'){
 globalThis.fetch=etsyFetch;requests.length=0;
 db.product={id:'p',title:'Internal artwork name',description:'Product copy',assets:[],variants:[],listings:[{id:'l',fulfillment,etsyListingId:'20',title:'Keep title',taxonomyId:123,description:'Required disclosure',tagsJson:'["keep"]',status:'DRAFT_CREATED',lastVerifiedAt:'old',observationJson:'old',assets:[]}]};
 db.remote={listing_id:20,shop_id:99,state,listing_type:fulfillment==='DIGITAL'?'download':'physical',title:'Keep Etsy title',description:'Remote disclosure',tags:['keep'],quantity:10,taxonomy_id:123,price:{amount:4900,divisor:100,currency_code:'USD'},last_modified_timestamp:1};db.journals=[];db.writes=0;db.mode=true;db.unknown=false;db.failFinalize=false;db.inventoryDrift=false;db.taxonomy[0].name='Wall Decor';
 return {productId:'p',fulfillment,expectedEtsyListingId:'20',newTaxonomyId:456};
}
db.spellmarkJournal={findFirst:async({where})=>structuredClone(db.journals.find(j=>Object.entries(where).every(([k,v])=>j[k]===v))??null),findUnique:async({where})=>structuredClone(db.journals.find(j=>j.productId===where.productId_requestId.productId&&j.requestId===where.productId_requestId.requestId)??null),create:async({data})=>{const j={id:'journal-'+db.journals.length,...data};db.journals.push(j);return j;},update:async({where,data})=>{if(db.failFinalize&&JSON.parse(data.bodyJson).state==='CATEGORY_VERIFIED')throw Error('db failure');Object.assign(db.journals.find(j=>j.requestId===where.productId_requestId.requestId),data);}};
db.spellmarkListing={update:async({data})=>Object.assign(db.product.listings[0],data)};db.$queryRaw=async()=>[];
db.$transaction=async fn=>{const before=structuredClone({product:db.product,journals:db.journals});try{return await fn(db);}catch(e){Object.assign(db,before);throw e;}};
const hooks=registerHooks({resolve(s,c,next){if(s==='../etsy-client'&&(c.parentURL?.endsWith('/etsy-reconciliation-read.ts')||c.parentURL?.endsWith('/etsy-category-transport.ts')))return {url:'data:text/javascript,export function etsyHeaders(){return {Authorization:"Bearer test"}}',shortCircuit:true};if(c.parentURL?.endsWith('/etsy-category-executor.ts')){const stubs={'../prisma':'export const prisma=globalThis.__categoryDb;','../warlock-mcp/repository':'export async function findWarlockProduct(){return structuredClone(globalThis.__categoryDb.product);}','../warlock-auth':'export async function getWarlockEtsyOperatorContext(){return {shopId:99,auth:{session:{access_token:"test"}}};}','./write-guard.ts':'export function assertCommerceDraftWritesEnabled(){if(!globalThis.__categoryDb.mode)throw Error("warlock_commerce_writes_disabled");}'};if(stubs[s])return {url:'data:text/javascript,'+encodeURIComponent(stubs[s]),shortCircuit:true};}return next(s,c);}});
const {previewEtsyListingCategory,applyEtsyListingCategory}=await import('../lib/warlock-commerce/etsy-category-executor.ts');hooks.deregister();
test('taxonomy validation rejects malformed IDs and unconfirmed approvals',()=>{for(const v of [0,-1,1.5,'456',null])assert.equal(etsyTaxonomyId.safeParse(v).success,false);assert.throws(()=>categoryApplySchema.parse({productId:'p',previewId:'x',confirmCategoryChange:false}));assert.equal(safeCategoryError(Error('secret token')),'etsy_category_edit_failed');});
test('preview shows canonical/remote/proposed categories and active state without edits',async()=>{const input=setup();const before=structuredClone(db.product),p=await previewEtsyListingCategory(input);assert.equal(p.preview.canonicalTaxonomyId,123);assert.equal(p.preview.remote.taxonomyId,123);assert.equal(p.preview.remote.state,'active');assert.equal(p.preview.input.newTaxonomyId,input.newTaxonomyId);assert.deepEqual(db.product,before);assert.equal(db.writes,0);});
test('active digital and draft physical apply save intent first and verify only category changes',async()=>{for(const [state,fulfillment] of [['active','DIGITAL'],['draft','DIGITAL'],['active','PHYSICAL'],['draft','PHYSICAL']]){const input=setup(state,fulfillment),before=structuredClone(db.product),remoteBefore=structuredClone(db.remote),p=await previewEtsyListingCategory(input),r=await applyEtsyListingCategory({productId:'p',previewId:p.previewId,confirmCategoryChange:true});assert.equal(r.state,'CATEGORY_VERIFIED');assert.equal(r.published,false);assert.equal(db.writes,1);assert.equal(db.product.title,before.title);assert.equal(db.product.listings[0].title,before.listings[0].title);assert.equal(db.remote.title,remoteBefore.title);assert.equal(db.product.listings[0].description,before.listings[0].description);assert.equal(db.remote.state,state);assert.equal(db.remote.description,remoteBefore.description);assert.equal(db.remote.quantity,10);assert.equal(db.product.listings[0].taxonomyId,input.newTaxonomyId);const retry=await applyEtsyListingCategory({productId:'p',previewId:p.previewId,confirmCategoryChange:true});assert.equal(retry.reused,true);assert.equal(db.writes,1);}});
test('canonical-only convergence does not claim an Etsy write',async()=>{const input=setup();db.remote.taxonomy_id=input.newTaxonomyId;const p=await previewEtsyListingCategory(input);const r=await applyEtsyListingCategory({productId:'p',previewId:p.previewId,confirmCategoryChange:true});assert.equal(r.state,'CATEGORY_VERIFIED');assert.equal(r.etsyMutated,false);assert.equal(db.writes,0);});
test('ownership/state/type mismatches cannot produce an approval preview',async()=>{for(const [key,value] of [['shop_id',100],['listing_id',21],['state','inactive'],['listing_type','physical']]){const input=setup();db.remote[key]=value;await assert.rejects(previewEtsyListingCategory(input));assert.equal(db.writes,0);}});
test('disabled writes, expired approval, canonical and remote drift refuse mutation',async()=>{for(const mutate of [()=>db.mode=false,()=>db.product.listings[0].taxonomyId=789,()=>db.remote.taxonomy_id=789,()=>{const j=db.journals[0],p=JSON.parse(j.bodyJson);p.expiresAt=new Date(0).toISOString();j.bodyJson=JSON.stringify(p);}]){const input=setup(),p=await previewEtsyListingCategory(input);mutate();await assert.rejects(applyEtsyListingCategory({productId:'p',previewId:p.previewId,confirmCategoryChange:true}));assert.equal(db.writes,0);assert.equal(db.journals.filter(j=>j.kind==='ETSY_CATEGORY_CHANGE').length,0);}});
test('unknown network outcome persists intent; retry verifies and never repeats PATCH',async()=>{const input=setup(),p=await previewEtsyListingCategory(input);db.unknown=true;const r=await applyEtsyListingCategory({productId:'p',previewId:p.previewId,confirmCategoryChange:true});assert.equal(r.state,'NEEDS_REVIEW');assert.equal(JSON.parse(db.journals[1].bodyJson).state,'SENDING');assert.equal(db.product.listings[0].taxonomyId,input.newTaxonomyId);const retry=await applyEtsyListingCategory({productId:'p',previewId:p.previewId,confirmCategoryChange:true});assert.equal(retry.state,'CATEGORY_VERIFIED');assert.equal(db.writes,1);});
test('post-write database rollback keeps durable SENDING evidence and supports read-only recovery',async()=>{const input=setup(),p=await previewEtsyListingCategory(input);db.failFinalize=true;const r=await applyEtsyListingCategory({productId:'p',previewId:p.previewId,confirmCategoryChange:true});assert.equal(r.state,'NEEDS_REVIEW');assert.equal(db.remote.taxonomy_id,input.newTaxonomyId);assert.equal(JSON.parse(db.journals[1].bodyJson).state,'SENDING');db.failFinalize=false;db.inventoryDrift=false;db.taxonomy[0].name='Wall Decor';const retry=await applyEtsyListingCategory({productId:'p',previewId:p.previewId,confirmCategoryChange:true});assert.equal(retry.state,'CATEGORY_VERIFIED');assert.equal(db.writes,1);});
test('uncertain old or independently changed remote state never gets replayed',async()=>{const input=setup(),p=await previewEtsyListingCategory(input);db.unknown=true;await applyEtsyListingCategory({productId:'p',previewId:p.previewId,confirmCategoryChange:true});db.remote.taxonomy_id=123;const retry=await applyEtsyListingCategory({productId:'p',previewId:p.previewId,confirmCategoryChange:true});assert.equal(retry.state,'NEEDS_REVIEW');assert.equal(db.writes,1);});
// Exercise actual narrow HTTP transport separately.
const transportHooks=registerHooks({resolve(s,c,next){if(c.parentURL?.endsWith('/etsy-category-transport.ts')&&s==='../etsy-client')return {url:'data:text/javascript,export function etsyHeaders(){return {Authorization:"Bearer test"}}',shortCircuit:true};return next(s,c);}});const {writeEtsyCategory}=await import('../lib/warlock-commerce/etsy-category-transport.ts');transportHooks.deregister();
test('category transport sends only the taxonomy_id form key to the existing shop listing PATCH',async()=>{const saved=globalThis.fetch;let req;globalThis.fetch=async(url,args)=>{req={url,args};return new Response('{}',{status:200});};try{await writeEtsyCategory('test',99,'20',456);assert.equal(req.args.method,'PATCH');assert.equal(req.url,'https://api.etsy.com/v3/application/shops/99/listings/20');assert.deepEqual([...req.args.body.keys()],['taxonomy_id']);assert.equal(req.args.body.get('taxonomy_id'),'456');}finally{globalThis.fetch=saved;}});

test('missing or changed live taxonomy rejects approval without writes',async()=>{
 const input=setup();input.newTaxonomyId=999;await assert.rejects(previewEtsyListingCategory(input),/taxonomy_not_found/);
 const next=setup(),p=await previewEtsyListingCategory(next);db.taxonomy[0].name='Changed';
 await assert.rejects(applyEtsyListingCategory({productId:'p',previewId:p.previewId,confirmCategoryChange:true}),/taxonomy_changed/);assert.equal(db.writes,0);
});
test('inventory drift before apply blocks write; post-write drift reports discrepancy without replay',async()=>{
 const input=setup('active','PHYSICAL'),p=await previewEtsyListingCategory(input);db.inventory.products[0].product_id=2;
 await assert.rejects(applyEtsyListingCategory({productId:'p',previewId:p.previewId,confirmCategoryChange:true}),/remote_changed/);assert.equal(db.writes,0);
 db.inventory.products[0].product_id=1;const fresh=await previewEtsyListingCategory(input);db.inventoryDrift=true;
 const r=await applyEtsyListingCategory({productId:'p',previewId:fresh.previewId,confirmCategoryChange:true});assert.equal(r.state,'NEEDS_REVIEW');assert.equal(r.errorCode,'etsy_category_readback_mismatch');
 const retry=await applyEtsyListingCategory({productId:'p',previewId:fresh.previewId,confirmCategoryChange:true});assert.equal(retry.state,'NEEDS_REVIEW');assert.equal(db.writes,1);
});

test('real read transport permits only exact taxonomy path and retains GET-only allowlist',async()=>{
 const input=setup('active','PHYSICAL'),p=await previewEtsyListingCategory(input);
 assert.ok(requests.some(r=>r.url.endsWith('/seller-taxonomy/nodes')));assert.ok(requests.every(r=>r.method==='GET'));assert.equal(p.preview.target.id,456);
 const {readEtsyForReconciliation}=await import('../lib/warlock-commerce/etsy-reconciliation-read.ts');
 for(const path of ['/seller-taxonomy/nodes?secret=1','/seller-taxonomy/nodes/123','/shops/99','https://private.example'])await assert.rejects(readEtsyForReconciliation('test',path),/path_invalid/);
 assert.equal(safeCategoryError(Error('etsy_reconciliation_path_invalid')),'etsy_reconciliation_path_invalid');
});
test('taxonomy nodes may omit optional parent_id, but invalid IDs give sanitized field diagnostics',async()=>{
 const input=setup();delete db.taxonomy[0].parent_id;
 const p=await previewEtsyListingCategory(input);assert.equal(p.preview.target.path,'Wall Decor');
 db.taxonomy[0].id='secret remote string';
 await assert.rejects(previewEtsyListingCategory(input),e=>{assert.equal(safeCategoryError(e),'etsy_category_response_invalid');const details=categoryErrorDetails(e);assert.equal(details.validation.stage,'seller_taxonomy');assert.equal(details.validation.fields[0].field,'0.id');assert.ok(!JSON.stringify(details).includes('secret'));return true;});
 db.taxonomy[0].id=456;db.taxonomy[0].parent_id=null;
});
