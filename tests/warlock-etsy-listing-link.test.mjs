import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { buildListingLinkPreview, validateListingLinkPreview, safeListingLinkError, listingLinkApplySchema } from '../lib/warlock-commerce/etsy-listing-link.ts';

function fixture(fulfillment='PHYSICAL',linked=true) {
 const assets=[{id:'asset',role:'master',fileName:'approved.png',blobUrl:'https://private.test/approved',pathname:'approved',contentType:'image/png',byteSize:100}];
 const listing={id:'l',fulfillment,title:'Approved art',description:'Approved copy',taxonomyId:123,etsyListingId:linked?'10':null,
  printfulSyncProductId:900,status:linked?'SYNCED':'CONFIG',quantity:999,whoMade:'i_did',whenMade:'2020_2026',digitalDelivery:'INSTANT_DOWNLOAD',
  shippingProfileId:'11',readinessStateId:'12',shopSectionId:'13',productionPartnerId:fulfillment==='PHYSICAL'?'14':null,
  etsyAdsEnabled:false,digitalContentCreationType:fulfillment==='DIGITAL'?'AI_ASSISTED_DIGITAL_DESIGN':null,
  tagsJson:'[]',isSupply:false,shouldAutoRenew:true,lastVerifiedAt:null,observationJson:'old evidence',
  etsyConfigurationEvidenceJson:'old configuration',etsyDraftSettingsVerificationJson:'old settings',lastDraftSyncAt:new Date().toISOString(),
  assets:[{id:'link',kind:'image',position:1,etsyRemoteId:'88',etsySyncedAt:new Date().toISOString(),asset:assets[0]}]};
 const v={id:'v',fulfillment,label:'Black / S',printfulProductId:411,printfulVariantId:11254,printfulStoreId:99,
  etsyListingId:linked?'10':null,etsySku:'SM-V',etsyProductId:'41',printfulSyncVariantId:901,
  retailPriceCents:4900,productionBaseCents:2300,productionQuotedAt:new Date().toISOString(),productionQuoteJson:'old quote',currency:'USD'};
 const product={id:'p',title:'Approved art',collection:'Spellmark',description:'Approved product copy',artworkReference:'Approved',status:'READY',notes:'',assets,variants:[v],listings:[listing]};
 const target={listing_id:20,shop_id:99,state:'draft',listing_type:fulfillment==='PHYSICAL'?'physical':'download',title:listing.title,
  taxonomy_id:123,when_made:'2020_2026',price:{amount:4900,divisor:100,currency_code:'USD'},description:'Owner reviewed copy'};
 const inventory={products:[{product_id:51,sku:'SM-V',property_values:[{property_id:513,values:['Black / S']}],offerings:[{is_enabled:true,is_deleted:false,quantity:999,price:{amount:4900,divisor:100,currency_code:'USD'}}]}]};
 const input={productId:'p',fulfillment,expectedEtsyListingId:linked?'10':null,targetEtsyListingId:'20'};
 const calls=[];let sourceMissing=true;let accessError=null;
 const read=async path=>{calls.push(path);if(path.includes('?state=draft')){if(accessError)throw Error(accessError);return {count:1,results:[target]};}
  if(path==='/listings/10'){if(sourceMissing)throw Error('etsy_http_404');return {...target,listing_id:10,state:'inactive'};}
  if(path.includes('/inventory'))return structuredClone(inventory);if(path==='/listings/20')return structuredClone(target);throw Error('unexpected_path');};
 return {product,input,target,inventory,read,calls,setSourceExists:()=>sourceMissing=false,setAccessError:e=>accessError=e};
}
test('missing source cleanup has no target fetch and does not mutate the product',async()=>{
 const f=fixture(),before=structuredClone(f.product);f.input.targetEtsyListingId=null;
 const r=await buildListingLinkPreview(f.product,f.input,99,f.read);
 assert.equal(r.preview.snapshot.mode,'CLEAR_MISSING_LINK');assert.equal(r.preview.snapshot.source.status,'NOT_FOUND');
 assert.deepEqual(f.product,before);assert.ok(!f.calls.includes('/listings/20'));
});
test('any extant source and authentication or permission failures prevent cleanup',async()=>{
 const f=fixture();f.setSourceExists();await assert.rejects(buildListingLinkPreview(f.product,f.input,99,f.read),/source_still_exists/);
 for(const code of ['etsy_http_401','etsy_http_403','etsy_http_429','etsy_http_500']){
  const x=fixture();x.setAccessError(code);await assert.rejects(buildListingLinkPreview(x.product,x.input,99,x.read),new RegExp(code));
  assert.ok(!x.calls.includes('/listings/10'));
 }
 const x=fixture();await assert.rejects(buildListingLinkPreview(x.product,x.input,99,async path=>path.includes('?state=')?{count:0,results:[]}:Promise.reject(Error('etsy_http_403'))),/403/);
});
test('owned physical draft matches exact canonical SKUs, prices and variant set',async()=>{
 const f=fixture(),r=await buildListingLinkPreview(f.product,f.input,99,f.read);
 assert.equal(r.state,'PREVIEW_READY');assert.equal(r.preview.snapshot.mappings[0].etsyProductId,'51');
 assert.equal(r.preview.snapshot.mappings[0].canonicalLabel,'Black / S');assert.ok(f.calls.every(p=>!p.includes('DELETE')));
});
test('active/foreign/wrong product or fulfillment targets never produce an approval preview',async()=>{
 for(const [field,value,code] of [['state','active','not_draft'],['shop_id',100,'ownership_mismatch'],['listing_id',21,'ownership_mismatch'],
  ['title','Other product','title_mismatch'],['taxonomy_id',456,'taxonomy_mismatch'],['listing_type','download','type_mismatch']]){
  const f=fixture();f.target[field]=value;
  // The authenticated shop probe itself remains valid so target ownership is independently tested.
  const read=path=>path.includes('?state=')?Promise.resolve({count:0,results:[]}):f.read(path);
  await assert.rejects(buildListingLinkPreview(f.product,f.input,99,read),new RegExp(code));
 }
});
test('ambiguous SKU mapping returns choices; explicit complete mapping creates review preview',async()=>{
 const f=fixture();f.inventory.products[0].sku='OTHER-SKU';
 const unresolved=await buildListingLinkPreview(f.product,f.input,99,f.read);
 assert.equal(unresolved.state,'NEEDS_VARIANT_MAPPING');assert.equal(unresolved.snapshot.target.observedInventory[0].etsyProductId,'51');
 assert.equal(unresolved.preview,undefined);
 f.input.variantMappings=[{variantId:'v',etsyProductId:'51'}];const r=await buildListingLinkPreview(f.product,f.input,99,f.read);
 assert.equal(r.state,'PREVIEW_READY');assert.equal(r.preview.snapshot.mappings[0].sku,'OTHER-SKU');
});
test('incomplete/foreign mappings, changed prices and disabled inventory are refused',async()=>{
 for(const mutate of [f=>f.input.variantMappings=[],f=>f.input.variantMappings=[{variantId:'foreign',etsyProductId:'51'}],
  f=>f.input.variantMappings=[{variantId:'v',etsyProductId:'999'}],f=>f.inventory.products[0].offerings[0].price.amount=5000,
  f=>f.inventory.products[0].offerings[0].is_enabled=false,f=>f.inventory.products.push(structuredClone(f.inventory.products[0]))]){
  const f=fixture();mutate(f);await assert.rejects(buildListingLinkPreview(f.product,f.input,99,f.read));
 }
});
test('digital draft adoption checks price and delivery mode and never fetches physical inventory',async()=>{
 const f=fixture('DIGITAL',false),r=await buildListingLinkPreview(f.product,f.input,99,f.read);
 assert.equal(r.state,'PREVIEW_READY');assert.ok(!f.calls.some(p=>p.includes('/inventory')));
 f.target.when_made='made_to_order';await assert.rejects(buildListingLinkPreview(f.product,f.input,99,f.read),/delivery_mismatch/);
 f.target.when_made='2020_2026';f.target.price.amount=900;await assert.rejects(buildListingLinkPreview(f.product,f.input,99,f.read),/price_mismatch/);
});
test('expired approval, changed canonical data and remote drift require a fresh preview',async()=>{
 for(const mutate of [(f,p)=>p.expiresAt=new Date(0).toISOString(),f=>f.product.listings[0].etsyListingId='30',f=>f.target.description='Changed',f=>f.inventory.products[0].offerings[0].quantity=5]){
  const f=fixture(),r=await buildListingLinkPreview(f.product,f.input,99,f.read);mutate(f,r.preview);
  await assert.rejects(validateListingLinkPreview(f.product,r.preview,99,f.read));
 }
});
test('source reappearance between preview and apply blocks clearing even if target is unchanged',async()=>{
 const f=fixture(),r=await buildListingLinkPreview(f.product,f.input,99,f.read);f.setSourceExists();
 await assert.rejects(validateListingLinkPreview(f.product,r.preview,99,f.read),/source_still_exists/);
});
test('changed target during preview and sanitized errors fail closed',async()=>{
 const f=fixture();let hits=0;const read=async path=>{const r=await f.read(path);if(path==='/listings/20'&&++hits===2)r.title='Changed';return r;};
 await assert.rejects(buildListingLinkPreview(f.product,f.input,99,read),/target_changed_retry/);
 assert.equal(safeListingLinkError(Error('secret https://private.test/token')),'etsy_link_request_failed');
 assert.throws(()=>listingLinkApplySchema.parse({productId:'p',previewId:'x',confirmListingLink:false}));
});

// Run the real preview/apply executor against isolated transaction and GET-only transport mocks.
const db={product:null,journals:[],writes:[],occupied:[],read:null};globalThis.__listingLinkDb=db;
db.spellmarkListing={findFirst:async({where})=>db.occupied.includes(where.etsyListingId)||db.product.listings.some(l=>l.etsyListingId===where.etsyListingId)?{id:'occupied'}:null,
 update:async({where,data})=>{db.writes.push(['listing',data]);Object.assign(db.product.listings.find(l=>l.id===where.id),data);}};
db.spellmarkVariant={findFirst:async({where})=>db.occupied.includes(where.etsyListingId)||db.product.variants.some(v=>v.etsyListingId===where.etsyListingId)?{id:'occupied'}:null,
 update:async({where,data})=>{db.writes.push(['variant',data]);Object.assign(db.product.variants.find(v=>v.id===where.id),data);}};
db.spellmarkListingAsset={updateMany:async({where,data})=>{db.writes.push(['assets',data]);for(const l of db.product.listings)if(l.id===where.listingId)for(const a of l.assets)Object.assign(a,data);}};
db.spellmarkJournal={findFirst:async({where})=>db.journals.find(j=>Object.entries(where).every(([k,v])=>j[k]===v))??null,
 findUnique:async({where})=>db.journals.find(j=>j.productId===where.productId_requestId.productId&&j.requestId===where.productId_requestId.requestId)??null,
 create:async({data})=>{const row={id:'journal-'+(db.journals.length+1),...data};db.journals.push(row);return row;}};
db.$queryRaw=async()=>[];
db.$transaction=async(fn)=>{const before=structuredClone({product:db.product,journals:db.journals,writes:db.writes});try{return await fn(db);}catch(error){Object.assign(db,before);throw error;}};
const hooks=registerHooks({resolve(specifier,context,next){
 if(context.parentURL?.endsWith('/etsy-listing-link-executor.ts')){
  const stubs={'../prisma':'export const prisma=globalThis.__listingLinkDb;',
   '../warlock-mcp/repository':'export async function findWarlockProduct(){return structuredClone(globalThis.__listingLinkDb.product);}',
   '../warlock-auth':'export async function getWarlockEtsyOperatorContext(){return {shopId:99,auth:{session:{access_token:"test-only"}}};}',
   './etsy-reconciliation-read':'export const readEtsyForReconciliation=(_token,path)=>globalThis.__listingLinkDb.read(path);'};
  if(stubs[specifier])return {url:'data:text/javascript,'+encodeURIComponent(stubs[specifier]),shortCircuit:true};
 }return next(specifier,context);
}});
const {previewEtsyListingLink,applyEtsyListingLink}=await import('../lib/warlock-commerce/etsy-listing-link-executor.ts');hooks.deregister();
function setup(f){db.product=structuredClone(f.product);db.journals=[];db.writes=[];db.occupied=[];db.read=f.read;}
test('cleanup atomically clears all stale IDs and evidence, archives history, and preserves product data and sibling fulfillment',async()=>{
 const f=fixture();f.input.targetEtsyListingId=null;setup(f);
 const sibling={...structuredClone(f.product.listings[0]),id:'digital',fulfillment:'DIGITAL',etsyListingId:'100'};
 const siblingVariant={...structuredClone(f.product.variants[0]),id:'digital-v',fulfillment:'DIGITAL',etsyListingId:'100'};
 db.product.listings.push(sibling);db.product.variants.push(siblingVariant);
 const before=structuredClone(db.product),p=await previewEtsyListingLink(f.input),r=await applyEtsyListingLink({productId:'p',previewId:p.previewId,confirmListingLink:true});
 assert.equal(r.state,'MISSING_ETSY_LINK_CLEARED');assert.equal(r.etsyMutated,false);assert.equal(r.printfulMutated,false);
 const listing=db.product.listings[0],v=db.product.variants[0];
 assert.equal(listing.etsyListingId,null);assert.equal(listing.printfulSyncProductId,null);assert.equal(listing.status,'CONFIG');
 assert.equal(listing.assets[0].etsyRemoteId,null);assert.equal(v.etsyProductId,null);assert.equal(v.printfulSyncVariantId,null);assert.equal(v.productionQuoteJson,null);
 assert.deepEqual(db.product.assets,before.assets);assert.equal(listing.description,before.listings[0].description);assert.equal(listing.etsyAdsEnabled,false);
 assert.equal(v.retailPriceCents,4900);assert.equal(v.printfulVariantId,11254);assert.deepEqual(db.product.listings[1],before.listings[1]);
 assert.deepEqual(db.product.variants[1],before.variants[1]);
 const archive=JSON.parse(db.journals.find(j=>j.kind==='ETSY_LISTING_LINK_RESULT').bodyJson).archive;
 assert.equal(archive.listing.etsyListingId,'10');assert.equal(archive.variants[0].printfulSyncVariantId,901);
 const writes=db.writes.length;const retry=await applyEtsyListingLink({productId:'p',previewId:p.previewId,confirmListingLink:true});
 assert.equal(retry.reused,true);assert.equal(retry.historical,true);assert.equal(retry.archive,undefined);assert.equal(db.writes.length,writes);
});
test('existing draft adoption updates only reviewed variant linkage and resets supplier/artwork verification',async()=>{
 const f=fixture();setup(f);const p=await previewEtsyListingLink(f.input);
 const r=await applyEtsyListingLink({productId:'p',previewId:p.previewId,confirmListingLink:true});
 assert.equal(r.state,'EXISTING_DRAFT_LINKED');assert.equal(db.product.listings[0].etsyListingId,'20');
 assert.equal(db.product.variants[0].etsyProductId,'51');assert.equal(db.product.variants[0].etsySku,'SM-V');
 assert.equal(db.product.listings[0].status,'DRAFT_CREATED');assert.equal(db.product.listings[0].observationJson,null);
 assert.equal(r.supplierVerificationPending,true);assert.equal(r.visualVerificationPending,true);assert.equal(r.published,false);
});
test('a target linked elsewhere or claimed after preview is rejected without any writes',async()=>{
 const f=fixture();setup(f);db.occupied=['20'];await assert.rejects(previewEtsyListingLink(f.input),/already_linked/);
 assert.equal(db.journals.length,0);db.occupied=[];const p=await previewEtsyListingLink(f.input);db.occupied=['20'];
 await assert.rejects(applyEtsyListingLink({productId:'p',previewId:p.previewId,confirmListingLink:true}),/already_linked/);assert.equal(db.writes.length,0);
});
test('canonical drift, source reappearance and wrong product approval leave all records intact',async()=>{
 for(const change of [f=>db.product.variants[0].retailPriceCents=5000,f=>f.setSourceExists()]){
  const f=fixture();setup(f);const p=await previewEtsyListingLink(f.input);change(f);const before=structuredClone(db.product);
  await assert.rejects(applyEtsyListingLink({productId:'p',previewId:p.previewId,confirmListingLink:true}));assert.deepEqual(db.product,before);assert.equal(db.writes.length,0);
 }
 const f=fixture();setup(f);const p=await previewEtsyListingLink(f.input);
 await assert.rejects(applyEtsyListingLink({productId:'other',previewId:p.previewId,confirmListingLink:true}),/preview_not_found/);assert.equal(db.writes.length,0);
});
test('mid-transaction database failure rolls back link resets and the archive together',async()=>{
 const f=fixture();setup(f);const p=await previewEtsyListingLink(f.input),before=structuredClone(db.product),update=db.spellmarkVariant.update;
 db.spellmarkVariant.update=async()=>{throw Error('database failure');};
 try{await assert.rejects(applyEtsyListingLink({productId:'p',previewId:p.previewId,confirmListingLink:true}),/database failure/);
  assert.deepEqual(db.product,before);assert.equal(db.journals.filter(j=>j.kind==='ETSY_LISTING_LINK_RESULT').length,0);
 }finally{db.spellmarkVariant.update=update;}
});
