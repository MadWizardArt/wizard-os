import test from 'node:test';
import assert from 'node:assert/strict';
import { executeEtsyDraftOnly } from '../lib/warlock-commerce/etsy-draft-only.ts';

const disclosure = 'Created using a combination of original art direction, digital design, and AI-assisted image-making.';
function fixture() {
  const assets = ['master', 'hero', 'mockup'].map((role, i) => ({id:'a'+i,role,fileName:role+'.png',blobUrl:'https://private.test/'+role,pathname:role,contentType:'image/png',byteSize:100}));
  return {id:'p',title:'Vulpis',collection:'Spellmark',description:disclosure,artworkReference:'back and sleeve',status:'PRODUCTION',notes:'',assets,
    variants:[{id:'v',fulfillment:'PHYSICAL',label:'Black / S',printfulProductId:411,printfulVariantId:11254,printfulStoreId:99,etsyListingId:null,etsySku:null,etsyProductId:null,printfulSyncVariantId:null,retailPriceCents:4995,productionBaseCents:null,productionQuotedAt:null,currency:'USD'}],
    listings:[{id:'l',fulfillment:'PHYSICAL',shopSectionId:'11',productionPartnerId:'12',title:'Vulpis',description:disclosure,tagsJson:'[]',taxonomyId:2202,shippingProfileId:'123',readinessStateId:'456',quantity:999,whoMade:'i_did',whenMade:'2020_2026',isSupply:false,shouldAutoRenew:true,etsyListingId:null,printfulSyncProductId:null,lastDraftSyncAt:null,status:'READY',assets:[{id:'link',kind:'image',position:1,etsyRemoteId:null,etsySyncedAt:null,asset:assets[1]}]}]};
}
function harness(manifest=fixture()) {
  const calls=[];
  const supplier={configured:true,pass:true,checkedAt:new Date().toISOString(),errors:[],variants:[{variantId:'v',quote:{catalogProductId:411,catalogVariantId:11254,storeId:99,currency:'USD',availability:'in_stock',productionBaseCents:2725,quotedAt:new Date().toISOString()}}]};
  const deps={assertWritesEnabled:()=>calls.push('guard'),loadProduct:async()=>{calls.push('load');return manifest;},preflight:async()=>{calls.push('preflight');return supplier;},verifyAsset:async a=>calls.push('verify:'+a.id),writeDraft:async m=>{calls.push('etsy');assert.equal(m.variants[0].productionBaseCents,2725);return {listingId:'draft'};}};
  return {manifest,supplier,deps,calls};
}
test('new apparel draft succeeds with missing saved quote but remains provisional and unconfigured',async()=>{
  const h=harness(); const r=await executeEtsyDraftOnly('p',h.deps);
  assert.equal(r.state,'DRAFT_CREATED_AWAITING_PLACEMENTS');
  assert.equal(r.productionReady,false);assert.equal(r.printfulMutated,false);assert.equal(r.published,false);
  assert.equal(r.quoteScope,'PROVISIONAL_PREFLIGHT');
  assert.deepEqual(h.calls,['guard','load','preflight','verify:a0','verify:a1','verify:a2','etsy']);
  assert.equal(h.manifest.variants[0].productionBaseCents,null);
  assert.ok(r.pendingChecks.includes('Combined placement costs and margins'));
});
test('write guard rejects before any reads or writes',async()=>{
  const h=harness();h.deps.assertWritesEnabled=()=>{throw Error('disabled');};
  await assert.rejects(executeEtsyDraftOnly('p',h.deps),/disabled/);assert.deepEqual(h.calls,[]);
});
test('invalid listing blocks before supplier or Etsy calls',async()=>{
  const h=harness();h.manifest.listings[0].shippingProfileId=null;
  const r=await executeEtsyDraftOnly('p',h.deps);assert.equal(r.state,'BLOCKED');assert.ok(r.blockers.includes('shipping_profile_missing'));assert.deepEqual(h.calls,['guard','load']);
});
test('unavailable supplier blocks Etsy writes',async()=>{
  const h=harness();h.supplier.pass=false;h.supplier.errors=['out_of_stock'];
  const r=await executeEtsyDraftOnly('p',h.deps);assert.equal(r.state,'BLOCKED');assert.ok(r.blockers.includes('out_of_stock'));assert.ok(!h.calls.includes('etsy'));
});
test('low provisional contribution margin still blocks draft writes',async()=>{
  const h=harness();h.supplier.variants[0].quote.productionBaseCents=4900;
  const r=await executeEtsyDraftOnly('p',h.deps);assert.equal(r.state,'BLOCKED');assert.ok(r.blockers.includes('contribution_margin_below_floor'));assert.ok(!h.calls.includes('etsy'));
});
test('private storage failure blocks Etsy writes',async()=>{
  const h=harness();h.deps.verifyAsset=async()=>{throw Error('missing');};
  const r=await executeEtsyDraftOnly('p',h.deps);assert.equal(r.state,'BLOCKED');assert.deepEqual(r.blockers,['canonical_asset_storage_unavailable']);assert.ok(!h.calls.includes('etsy'));
});
test('quotes expiring during storage checks are rejected before Etsy writes',async()=>{
  const h=harness();h.deps.verifyAsset=async()=>{h.supplier.variants[0].quote.quotedAt=new Date(Date.now()-121000).toISOString();};
  const r=await executeEtsyDraftOnly('p',h.deps);assert.equal(r.state,'BLOCKED');assert.ok(r.blockers.includes('live_production_quote_expired'));assert.ok(!h.calls.includes('etsy'));
});
test('quote catalog identity mismatch blocks writes',async()=>{
  const h=harness();h.supplier.variants[0].quote.catalogVariantId=123;
  const r=await executeEtsyDraftOnly('p',h.deps);assert.equal(r.state,'BLOCKED');assert.ok(r.blockers.includes('live_production_quote_missing_or_mismatched'));assert.ok(!h.calls.includes('etsy'));
});
test('active-listing refusal from existing Etsy writer propagates without a supplier fallback',async()=>{
  const h=harness();h.deps.writeDraft=async()=>{throw Error('etsy_listing_not_draft');};
  await assert.rejects(executeEtsyDraftOnly('p',h.deps),/etsy_listing_not_draft/);
  assert.ok(!h.calls.some(c=>c.includes('printful')));
});
