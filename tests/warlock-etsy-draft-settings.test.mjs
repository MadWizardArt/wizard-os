import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { appendDraftSettings, draftSettingsBlockers, draftSettingsManualActions, etsySettingId,
  verifyDraftSettingsIds, observeDraftSettings, ETSY_DRAFT_CAPABILITIES } from '../lib/warlock-commerce/etsy-draft-settings.ts';
import { readListingManifest } from '../lib/warlock-listings.ts';
import { ETSY_AI_DISCLOSURE } from '../lib/warlock-commerce/policy.ts';
import { evaluateCommerceGates } from '../lib/warlock-commerce/gates.ts';

const digital = () => ({ id:'ld',fulfillment:'DIGITAL',title:'Digital art',description:ETSY_AI_DISCLOSURE,
  shopSectionId:'11',productionPartnerId:null,digitalContentCreationType:'AI_ASSISTED_DIGITAL_DESIGN',
  etsyAdsEnabled:true,taxonomyId:123,shippingProfileId:null,readinessStateId:null,quantity:999,
  whoMade:'i_did',whenMade:'made_to_order',digitalDelivery:'MADE_TO_ORDER',tagsJson:'[]',
  shouldAutoRenew:true,isSupply:false,etsyListingId:null,status:'READY',assets:[] });
const physical = () => ({...digital(),id:'lp',fulfillment:'PHYSICAL',productionPartnerId:'12',
  digitalContentCreationType:null,digitalDelivery:'INSTANT_DOWNLOAD',whenMade:'2020_2026',shippingProfileId:'13',readinessStateId:'14'});
const variant = fulfillment => ({id:'v'+fulfillment,fulfillment,label:'Edition',retailPriceCents:4900,
  printfulProductId:1,printfulVariantId:2,printfulStoreId:3,productionBaseCents:1000,productionQuotedAt:new Date(),currency:'USD'});
const manifest = listing => ({id:'p',title:'Spellmark art',description:ETSY_AI_DISCLOSURE,collection:'Cabinet',assets:[],
  artworkReference:'Approved',status:'READY',notes:'',variants:[variant(listing.fulfillment)],listings:[listing]});

test('new digital intent defaults to Ads on, AI-assisted design, and no production partner',()=>{
  const parsed=readListingManifest({fulfillment:'DIGITAL',title:'Art'});
  assert.equal(parsed.etsyAdsEnabled,true);assert.equal(parsed.productionPartnerId,null);
  assert.equal(parsed.digitalContentCreationType,'AI_ASSISTED_DIGITAL_DESIGN');
  assert.equal(readListingManifest({fulfillment:'DIGITAL',title:'Art',productionPartnerId:'12'}),null);
  assert.equal(readListingManifest({fulfillment:'PHYSICAL',title:'Art',digitalContentCreationType:'AI_ASSISTED_DIGITAL_DESIGN'}),null);
});
test('explicit Ads off override survives canonical parsing and remains a manual remote action',()=>{
  const parsed=readListingManifest({fulfillment:'DIGITAL',title:'Art',etsyAdsEnabled:false});
  assert.equal(parsed.etsyAdsEnabled,false);
  assert.equal(draftSettingsManualActions(parsed)[0].intendedEnabled,false);
});
test('unresolved sections and physical partners fail closed; digital partners are refused',()=>{
  assert.deepEqual(draftSettingsBlockers({...digital(),shopSectionId:null}),['shop_section_configuration_required']);
  assert.deepEqual(draftSettingsBlockers({...physical(),productionPartnerId:null}),['production_partner_configuration_required']);
  assert.ok(draftSettingsBlockers({...digital(),productionPartnerId:'12'}).includes('digital_production_partner_not_allowed'));
});
test('setting IDs retain int64 strings and reject rounded numbers and out-of-range IDs',()=>{
  assert.equal(etsySettingId('9223372036854775807'),'9223372036854775807');
  for(const id of ['0','-1','1.1','9223372036854775808',9007199254740992,{},null]) assert.equal(etsySettingId(id),null);
});
test('outbound form assigns product-specific section and Printful partner, with no invented API fields',()=>{
  for(const listing of [digital(),physical()]) {
    const form=new URLSearchParams();appendDraftSettings(form,listing);
    assert.equal(form.get('shop_section_id'),'11');
    assert.equal(form.get('production_partner_ids'),listing.fulfillment==='DIGITAL'?'':'12');
    assert.deepEqual([...form.keys()],['shop_section_id','production_partner_ids']);
  }
  assert.throws(()=>appendDraftSettings(new URLSearchParams(),{...physical(),shopSectionId:null}),/incomplete/);
});
test('digital live verification never fetches or assigns a production partner',async()=>{
  const calls=[];const listing=digital();
  const evidence=await verifyDraftSettingsIds(manifest(listing),listing,99,async path=>{calls.push(path);return {shop_section_id:11,title:'Digital Prints'};});
  assert.deepEqual(calls,['/shops/99/sections/11']);assert.equal(evidence.productionPartner,null);
});
test('physical partner is checked against live shop and canonical Printful fulfillment',async()=>{
  const listing=physical();const m=manifest(listing);
  const read=async path=>path.includes('/sections/')?{shop_section_id:11}:{results:[{production_partner_id:12,partner_name:'Printful'}]};
  assert.equal((await verifyDraftSettingsIds(m,listing,99,read)).productionPartner.name,'Printful');
  await assert.rejects(verifyDraftSettingsIds(m,listing,99,async path=>path.includes('/sections/')?{shop_section_id:11}:{results:[]}),/partner_not_found/);
  await assert.rejects(verifyDraftSettingsIds(m,listing,99,async path=>path.includes('/sections/')?{shop_section_id:11}:{results:[{production_partner_id:12,partner_name:'Other supplier'}]}),/not_printful/);
  m.variants[0].printfulStoreId=null;await assert.rejects(verifyDraftSettingsIds(m,listing,99,read),/supplier_configuration_required/);
});
test('changed live section ID is refused',async()=>{
  const listing=digital();await assert.rejects(verifyDraftSettingsIds(manifest(listing),listing,99,async()=>({shop_section_id:22})),/section_mismatch/);
});
test('readback verifies category, section and exact disclosure without claiming unsupported controls',()=>{
  const listing={...digital(),etsyListingId:'77'};
  const remote={listing_id:77,shop_id:99,state:'draft',taxonomy_id:123,shop_section_id:11,description:ETSY_AI_DISCLOSURE};
  const result=observeDraftSettings(listing,remote,99);
  assert.equal(result.supportedSettingsVerified,true);assert.equal(result.fullyConfigured,false);
  assert.deepEqual(result.manualActions.map(a=>a.code),['MANUAL_ETSY_ADS_ACTION_REQUIRED','MANUAL_DIGITAL_CONTENT_CREATION_ACTION_REQUIRED','MANUAL_PRODUCTION_PARTNER_VERIFICATION_REQUIRED']);
  for(const mutate of [r=>r.shop_section_id=22,r=>r.state='active',r=>r.shop_id=1,r=>r.listing_id=2,r=>r.taxonomy_id=2,r=>r.description='Different wording']){
    const changed=structuredClone(remote);mutate(changed);assert.equal(observeDraftSettings(listing,changed,99).supportedSettingsVerified,false);
  }
  assert.equal(ETSY_DRAFT_CAPABILITIES.productionPartner.readback,false);
  assert.equal(ETSY_DRAFT_CAPABILITIES.etsyAds.write,false);
});
test('gates expose settings blockers before an execution plan can write',()=>{
  const listing={...digital(),shopSectionId:null};
  const gates=evaluateCommerceGates(manifest(listing));
  assert.equal(gates.compliance.pass,false);
  assert.ok(gates.errors.some(e=>e.code==='shop_section_configuration_required'));
  assert.ok(gates.warnings.some(e=>e.code==='MANUAL_ETSY_ADS_ACTION_REQUIRED'));
});

// Exercise the real draft writer with isolated auth/database/storage modules and mocked Etsy HTTP.
// No credentials, real database or live commerce request can be reached by this test file.
globalThis.__etsySettingsDb={updates:[],journals:[],spellmarkListing:{update:async args=>{
  globalThis.__etsySettingsDb.updates.push(args);return args.data;
}},spellmarkVariant:{update:async()=>({})},spellmarkListingAsset:{update:async()=>({})},spellmarkJournal:{create:async args=>{
  globalThis.__etsySettingsDb.journals.push(args);return args.data;
}}};
const hooks=registerHooks({resolve(specifier,context,next){
  if(['/etsy-draft-executor.ts','/etsy-config-writer.ts','/etsy-config-inspector.ts'].some(path=>context.parentURL?.endsWith(path))) {
    const stubs={ '../prisma':'export const prisma=globalThis.__etsySettingsDb;',
      '../warlock-auth':'export async function getWarlockEtsyOperatorContext(){return {shopId:99,auth:{session:{access_token:"test-only"}}};}',
      '../etsy-client':'export function etsyHeaders(){return {};}',
      '@vercel/blob':'export async function get(){throw Error("unexpected_storage_call");}' };
    if(stubs[specifier])return {url:'data:text/javascript,'+encodeURIComponent(stubs[specifier]),shortCircuit:true};
  }
  return next(specifier,context);
}});
const {executeEtsyDrafts}=await import('../lib/warlock-commerce/etsy-draft-executor.ts');
const {applyVerifiedEtsyConfiguration}=await import('../lib/warlock-commerce/etsy-config-writer.ts');
const {inspectEtsyConfiguration}=await import('../lib/warlock-commerce/etsy-config-inspector.ts');
hooks.deregister();

async function runWriter(listings,respond,operation) {
  const previousFetch=globalThis.fetch,previousMode=process.env.WARLOCK_COMMERCE_WRITE_MODE;
  const calls=[];globalThis.__etsySettingsDb.updates=[];globalThis.__etsySettingsDb.journals=[];
  process.env.WARLOCK_COMMERCE_WRITE_MODE='draft';
  globalThis.fetch=async(url,init)=>{const call={url:String(url),method:init.method??'GET',body:init.body};calls.push(call);return Response.json(await respond(call));};
  try {
    const m=manifest(listings[0]);m.listings=listings;m.variants=listings.map(l=>variant(l.fulfillment));
    await operation(()=>executeEtsyDrafts(m),calls);
  } finally { globalThis.fetch=previousFetch;if(previousMode===undefined)delete process.env.WARLOCK_COMMERCE_WRITE_MODE;else process.env.WARLOCK_COMMERCE_WRITE_MODE=previousMode; }
}
test('writer validates every listing before the first Etsy mutation',async()=>{
  await runWriter([digital(),physical()],call=>call.url.includes('/sections/')?{shop_section_id:11}:{results:[]},async(write,calls)=>{
    await assert.rejects(write(),/production_partner_not_found/);assert.ok(calls.every(c=>c.method==='GET'));
    assert.equal(globalThis.__etsySettingsDb.updates.length,0);
  });
});
test('writer persists readback evidence and returns manual actions after a real mocked draft creation',async()=>{
  await runWriter([digital()],call=>{
    if(call.url.includes('/sections/'))return {shop_section_id:11};
    if(call.method==='POST')return {listing_id:77};
    return {listing_id:77,shop_id:99,state:'draft',shop_section_id:11,taxonomy_id:123,description:ETSY_AI_DISCLOSURE};
  },async(write,calls)=>{
    const result=await write();const post=calls.find(c=>c.method==='POST');
    assert.equal(post.body.get('shop_section_id'),'11');assert.equal(post.body.get('production_partner_ids'),'');
    assert.equal(post.body.get('description'),ETSY_AI_DISCLOSURE);assert.equal(post.body.has('state'),false);
    assert.equal(result.listings[0].settingsVerification.fullyConfigured,false);
    assert.ok(globalThis.__etsySettingsDb.updates.some(u=>u.data.etsyDraftSettingsVerificationJson));
    assert.ok(globalThis.__etsySettingsDb.journals.some(j=>j.data.kind==='ETSY_DRAFT_SETTINGS_VERIFICATION'));
  });
});
test('ignored section assignment persists discrepancy evidence and never reports success',async()=>{
  await runWriter([digital()],call=>call.url.includes('/sections/')?{shop_section_id:11}:call.method==='POST'?{listing_id:77}:
    {listing_id:77,shop_id:99,state:'draft',shop_section_id:22,taxonomy_id:123,description:ETSY_AI_DISCLOSURE},async(write)=>{
    await assert.rejects(write(),/verification_failed:etsy_shop_section_mismatch/);
    const evidence=JSON.parse(globalThis.__etsySettingsDb.updates.find(u=>u.data.etsyDraftSettingsVerificationJson).data.etsyDraftSettingsVerificationJson);
    assert.equal(evidence.supportedSettingsVerified,false);assert.deepEqual(evidence.discrepancies,['etsy_shop_section_mismatch']);
  });
});
test('unreadable readback retains failed evidence and clears prior settings success',async()=>{
  await runWriter([digital()],call=>{
    if(call.url.includes('/sections/'))return {shop_section_id:11};
    if(call.method==='POST')return {listing_id:77};
    throw Error('unavailable');
  },async(write)=>{
    await assert.rejects(write(),/readback_unavailable/);
    assert.equal(globalThis.__etsySettingsDb.updates[0].data.etsyDraftSettingsVerificationJson,null);
    const saved=globalThis.__etsySettingsDb.updates.filter(u=>u.data.etsyDraftSettingsVerificationJson).at(-1);
    assert.equal(JSON.parse(saved.data.etsyDraftSettingsVerificationJson).supportedSettingsVerified,false);
  });
});
test('configuration write validates live IDs then saves digital defaults and existing Ads override without remote mutation',async()=>{
  const listing={...digital(),etsyAdsEnabled:false,status:'CONFIG'};
  await runWriter([listing],call=>call.url.includes('/sections/')?{shop_section_id:11,title:'Digital Prints'}:
    {results:[{id:123,name:'Digital Prints',children:[]}]},async(_,calls)=>{
    const result=await applyVerifiedEtsyConfiguration(manifest(listing),{fulfillment:'DIGITAL',taxonomyId:123,shopSectionId:'11'});
    assert.ok(calls.every(c=>c.method==='GET'));
    const data=globalThis.__etsySettingsDb.updates[0].data;
    assert.equal(data.digitalContentCreationType,'AI_ASSISTED_DIGITAL_DESIGN');
    assert.equal(data.productionPartnerId,null);assert.equal(data.etsyAdsEnabled,false);
    assert.equal(JSON.parse(data.etsyConfigurationEvidenceJson).section.id,'11');
    assert.equal(result.fullyConfigured,false);assert.equal(result.externalEtsyMutation,false);
  });
});
test('configuration refuses a non-Printful shop partner without storing intent',async()=>{
  const listing=physical();await runWriter([listing],call=>{
    if(call.url.includes('/sections/'))return {shop_section_id:11};
    if(call.url.includes('/production-partners'))return {results:[{production_partner_id:12,partner_name:'Wrong supplier'}]};
    if(call.url.includes('/shipping-profiles/'))return {shipping_profile_id:13};
    if(call.url.includes('/readiness-state-definitions/'))return {readiness_state_id:14};
    return {results:[{id:123,name:'Clothing',children:[]}]};
  },async()=>{
    await assert.rejects(applyVerifiedEtsyConfiguration(manifest(listing),{fulfillment:'PHYSICAL',taxonomyId:123,
      shopSectionId:'11',productionPartnerId:'12',shippingProfileId:'13',readinessStateId:'14'}),/not_printful/);
    assert.equal(globalThis.__etsySettingsDb.updates.length,0);
  });
});
test('configuration inspection includes digital listings, current shop sections, partners and capability requirements',async()=>{
  const listing=digital();await runWriter([listing],call=>{
    if(call.url.endsWith('/sections'))return {results:[{shop_section_id:11,title:'Digital Prints'}]};
    if(call.url.endsWith('/production-partners'))return {results:[{production_partner_id:12,partner_name:'Printful'}]};
    return {results:[{id:123,name:'Digital Prints',children:[]}]};
  },async(_,calls)=>{
    const result=await inspectEtsyConfiguration(manifest(listing));
    assert.equal(result.listingConfigurations[0].fulfillment,'DIGITAL');
    assert.equal(result.shopSections[0].shopSectionId,'11');assert.equal(result.productionPartners[0].productionPartnerId,'12');
    assert.equal(result.capabilities.digitalContentCreation.write,false);
    assert.equal(result.sectionAutoSelected,false);assert.ok(calls.every(c=>c.method==='GET'));
    assert.equal(globalThis.__etsySettingsDb.updates.length,0);
  });
});
