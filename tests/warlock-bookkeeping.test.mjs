import test from 'node:test';
import assert from 'node:assert/strict';
import { readListingManifest } from '../lib/warlock-listings.ts';
import { validateWarlockManifest, buildWarlockDryRun } from '../lib/warlock-mcp/manifest.ts';
import { evaluateCommerceGates } from '../lib/warlock-commerce/gates.ts';
import { digitalWhenMade, assertEditableDraft } from '../lib/warlock-commerce/digital-delivery.ts';
import { observeEtsyListing, canonicalBookkeepingFingerprint, listingEvidenceFingerprint } from '../lib/warlock-commerce/listing-observation.ts';
import { ETSY_AI_DISCLOSURE } from '../lib/warlock-commerce/policy.ts';
const asset={id:'hero',role:'hero',fileName:'hero.jpg',byteSize:100,contentType:'image/jpeg',blobUrl:'https://example.test/hero',pathname:'hero'};
function fixture(custom=true){
 const listing={id:'listing',fulfillment:'DIGITAL',shopSectionId:'11',digitalContentCreationType:'AI_ASSISTED_DIGITAL_DESIGN',digitalDelivery:custom?'MADE_TO_ORDER':'INSTANT_DOWNLOAD',whenMade:custom?'made_to_order':'2020_2026',title:'Custom portrait',description:ETSY_AI_DISCLOSURE,quantity:999,taxonomyId:1,status:'READY',etsyListingId:'123',assets:[{id:'link',kind:'image',position:1,etsyRemoteId:'456',etsySyncedAt:null,asset}]};
 const product={id:'product',title:listing.title,status:'READY',notes:'',collection:'',description:'',artworkReference:'',assets:[asset],listings:[listing],variants:[{id:'variant',fulfillment:'DIGITAL',label:'Portrait',retailPriceCents:2495,currency:'USD'}]};
 const remote={listing_id:123,shop_id:77,state:'active',type:'download',when_made:listing.whenMade,title:listing.title,description:ETSY_AI_DISCLOSURE,price:{amount:2495,divisor:100,currency_code:'USD'}};
 return {product,listing,remote,images:{count:1,results:[{listing_id:123,listing_image_id:456,rank:1}]},files:{count:0,results:[]}};
}
const observe=f=>observeEtsyListing(f.product,f.listing,77,f.remote,f.images,f.files);
test('parser makes delivery mode explicit and rejects conflicting digital or physical modes',()=>{
 assert.equal(readListingManifest({fulfillment:'DIGITAL',title:'Portrait',digitalDelivery:'MADE_TO_ORDER'}).whenMade,'made_to_order');
 assert.equal(readListingManifest({fulfillment:'DIGITAL',title:'Download'}).digitalDelivery,'INSTANT_DOWNLOAD');
 assert.equal(readListingManifest({fulfillment:'DIGITAL',title:'Portrait',digitalDelivery:'MADE_TO_ORDER',whenMade:'2020_2026'}),null);
 assert.equal(readListingManifest({fulfillment:'PHYSICAL',title:'Shirt',digitalDelivery:'MADE_TO_ORDER'}),null);
});
test('custom digital package needs listing imagery but no finished master or instant file',()=>{
 const f=fixture();assert.equal(validateWarlockManifest(f.product).ready,true);assert.equal(evaluateCommerceGates(f.product).pass,true);assert.equal(digitalWhenMade(f.listing),'made_to_order');
 assert.match(buildWarlockDryRun(f.product).steps.find(s=>s.action.includes('after purchase')).action,/after purchase/);
 const noHero={...f.product,assets:[],listings:[{...f.listing,assets:[]}]};assert.equal(validateWarlockManifest(noHero).ready,false);assert.equal(evaluateCommerceGates(noHero).pass,false);
});
test('instant downloads retain finished asset and customer-file requirements',()=>{
 const f=fixture(false);assert.equal(validateWarlockManifest(f.product).ready,false);assert.ok(evaluateCommerceGates(f.product).errors.some(e=>e.code==='digital_customer_files_missing'));
});
test('custom listing rejects instant-download files and mixed physical editions still need a master',()=>{
 const f=fixture();f.listing.assets.push({...f.listing.assets[0],id:'filelink',kind:'customer_file'});
 assert.throws(()=>digitalWhenMade(f.listing),/cannot_have_listing_downloads/);assert.ok(evaluateCommerceGates(f.product).errors.some(e=>e.code==='made_to_order_cannot_have_listing_downloads'));
 f.product.variants.push({id:'physical',fulfillment:'PHYSICAL',label:'Print'});assert.ok(validateWarlockManifest(f.product).errors.some(e=>e.code==='master_missing'));
});
test('draft executor guard preserves active listings, owned shop, type and existing delivery mode',()=>{
 const f=fixture();assert.throws(()=>assertEditableDraft(f.listing,f.remote,77),/not_draft/);
 f.remote.state='draft';assert.doesNotThrow(()=>assertEditableDraft(f.listing,f.remote,77));
 assert.throws(()=>assertEditableDraft(f.listing,f.remote,78),/ownership/);
 assert.throws(()=>assertEditableDraft(f.listing,{...f.remote,type:'physical'},77),/type_mismatch/);
 assert.throws(()=>assertEditableDraft(f.listing,{...f.remote,when_made:'2020_2026'},77),/mode_locked/);
});
test('active custom digital reconciliation returns verified evidence without mutating canonical data',()=>{
 const f=fixture(),before=structuredClone(f);const result=observe(f);assert.equal(result.observedState,'active');assert.equal(result.assessment,'VERIFIED');assert.equal(result.etsyMutated,false);assert.deepEqual(f,before);
});
test('instant digital reconciliation verifies live download files independently of draft executor',()=>{
 const f=fixture(false);assert.ok(observe(f).discrepancies.some(d=>d.code==='download_files_missing'));
 f.files={count:1,results:[{listing_id:123,listing_file_id:789,filename:'print.zip'}]};f.listing.assets.push({id:'filelink',kind:'customer_file',etsyRemoteId:'789',asset:{...asset,id:'zip',role:'customer_file'}});
 assert.equal(observe(f).assessment,'VERIFIED');
});
test('ownership, malformed money and incomplete remote collections fail before persistence',()=>{
 const f=fixture();assert.throws(()=>observe({...f,remote:{...f.remote,shop_id:88}}),/ownership/);
 assert.throws(()=>observe({...f,images:{count:2,results:f.images.results}}),/incomplete/);
 assert.throws(()=>observe({...f,remote:{...f.remote,price:{amount:1,divisor:0,currency_code:'USD'}}}),/invalid_etsy_price/);
 assert.throws(()=>observe({...f,files:{count:1,results:[{listing_id:999,listing_file_id:1}]}}),/identity/);
});
test('price drift, changed title, missing disclosure and deleted assets remain reviewable discrepancies',()=>{
 const f=fixture();f.remote.price.amount=3000;f.remote.title='Changed';f.remote.description='';f.images={count:0,results:[]};
 const result=observe(f);assert.equal(result.assessment,'NEEDS_REVIEW');for(const code of ['price_changed','title_changed','ai_disclosure_missing','saved_asset_missing_on_etsy'])assert.ok(result.discrepancies.some(d=>d.code===code));
});
test('explicit mapping repairs require owned links, observed IDs, expected prior IDs and unique associations',()=>{
 const f=fixture();f.listing.assets[0].etsyRemoteId=null;
 assert.equal(observe(f).assessment,'NEEDS_REVIEW');
 const mapping={linkId:'link',expectedRemoteId:null,remoteId:'456'};
 const run=maps=>observeEtsyListing(f.product,f.listing,77,f.remote,f.images,f.files,maps);
 assert.equal(run([mapping]).assessment,'VERIFIED');assert.equal(f.listing.assets[0].etsyRemoteId,null);
 assert.throws(()=>run([{...mapping,linkId:'foreign'}]),/not_owned/);assert.throws(()=>run([{...mapping,remoteId:'777'}]),/not_observed/);
 assert.throws(()=>run([mapping,mapping]),/duplicate/);assert.throws(()=>run([{...mapping,expectedRemoteId:'111'}]),/mapping_changed/);
});
test('verification timestamps do not change canonical signature but prices, workflow and links do',()=>{
 const f=fixture(),signature=canonicalBookkeepingFingerprint(f.product);f.listing.lastVerifiedAt=new Date();f.listing.observationJson='{}';assert.equal(canonicalBookkeepingFingerprint(f.product),signature);
 f.product.variants[0].retailPriceCents++;assert.notEqual(canonicalBookkeepingFingerprint(f.product),signature);
});

test('evidence fingerprint becomes historical after canonical price, delivery, copy or asset association changes',()=>{
 const f=fixture(),result=observe(f),signature=result.canonicalFingerprint;
 assert.equal(listingEvidenceFingerprint(f.listing,f.product.variants),signature);
 for(const edit of [x=>x.product.variants[0].retailPriceCents++,x=>x.listing.description='Changed',x=>x.listing.assets[0].etsyRemoteId='999',x=>x.listing.digitalDelivery='INSTANT_DOWNLOAD']){
  const copy=structuredClone(f);edit(copy);assert.notEqual(listingEvidenceFingerprint(copy.listing,copy.product.variants),signature);
 }
});
