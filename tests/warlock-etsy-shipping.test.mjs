import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { domesticProfile, profileCreateBody, auditShipping, listingSnapshot } from '../lib/warlock-commerce/etsy-shipping.ts';
const money = amount => ({amount,divisor:100,currency_code:'USD'});
function profile(profileId=1,usOnly=false) {return {shipping_profile_id:profileId,title:'Printful garments',is_deleted:false,profile_type:'manual',origin_country_iso:'US',origin_postal_code:'28273',shipping_profile_upgrades:[],shipping_profile_destinations:[{destination_country_iso:'US',destination_region:'none',primary_cost:money(499),secondary_cost:money(199),shipping_carrier_id:null,mail_class:null,min_delivery_days:3,max_delivery_days:7},...usOnly?[]:[{destination_country_iso:'CA'}]]};}
const db={};globalThis.__shippingDb=db;
function setup(){
 db.product={id:'p',title:'Artwork',description:'Keep',assets:[],variants:[],listings:[{id:'l',fulfillment:'PHYSICAL',etsyListingId:'20',shippingProfileId:'1',title:'Shirt',assets:[]}]};
 db.remote={listing_id:20,shop_id:99,state:'active',listing_type:'physical',shipping_profile_id:1,title:'Shirt',quantity:7,price:money(4200)};
 db.profiles={'1':profile()};db.journals=[];db.calls=[];db.mode=true;db.failCreate=false;db.failPatch=false;db.failFinalize=false;
}
const matches=(j,w)=>Object.entries(w).every(([k,v])=>j[k]===v);
db.spellmarkJournal={
 findFirst:async({where})=>structuredClone(db.journals.find(j=>matches(j,where))??null),
 findUnique:async({where})=>structuredClone(db.journals.find(j=>matches(j,where.productId_requestId))??null),
 create:async({data})=>{const j={id:'j'+db.journals.length,...data};db.journals.push(j);return structuredClone(j);},
 upsert:async({where,create})=>{let j=db.journals.find(j=>matches(j,where.productId_requestId));if(!j){j={id:'j'+db.journals.length,...create};db.journals.push(j);}return structuredClone(j);},
 updateMany:async({where,data})=>{const j=db.journals.find(j=>matches(j,where));if(j)Object.assign(j,data);return {count:j?1:0};},
 update:async({where,data})=>{if(db.failFinalize&&JSON.parse(data.bodyJson).state==='SHIPPING_VERIFIED')throw Error('db failed');const j=db.journals.find(j=>j.id===where.id);Object.assign(j,data);return structuredClone(j);},
};
db.spellmarkListing={update:async({data})=>Object.assign(db.product.listings[0],data)};db.$queryRaw=async()=>[];
db.$transaction=async fn=>{const product=structuredClone(db.product);try{return await fn(db);}catch(e){db.product=product;throw e;}};
const hooks=registerHooks({resolve(s,c,next){if(c.parentURL?.endsWith('/etsy-shipping-executor.ts')){
 const mocks={'../prisma':'export const prisma=globalThis.__shippingDb;', '../warlock-mcp/repository':'export async function findWarlockProduct(){return structuredClone(globalThis.__shippingDb.product);}', '../warlock-auth':'export async function getWarlockEtsyOperatorContext(){return {shopId:99,shop:{currency_code:"USD"},auth:{session:{access_token:"test"}}};}', '../etsy-client':'export function etsyHeaders(){return {Authorization:"Bearer test"};}', './write-guard.ts':'export function assertCommerceDraftWritesEnabled(){if(!globalThis.__shippingDb.mode)throw Error("warlock_commerce_writes_disabled");}'};
 if(mocks[s])return {url:'data:text/javascript,'+encodeURIComponent(mocks[s]),shortCircuit:true};}return next(s,c);}});
const {previewEtsyShippingChange:preview,applyEtsyShippingChange:apply}=await import('../lib/warlock-commerce/etsy-shipping-executor.ts');hooks.deregister();
const actualFetch=globalThis.fetch;
globalThis.fetch=async(url,args)=>{
 db.calls.push({url,method:args.method,body:args.body?Object.fromEntries(args.body):null});
 const path=new URL(url).pathname;
 if(args.method==='POST'){
  assert.equal(JSON.parse(db.journals.find(j=>j.kind==='ETSY_SHIPPING_CHANGE').bodyJson).state,'SENDING');
  const body=Object.fromEntries(args.body),p=profile(2,true);p.title=body.title;db.profiles['2']=p;
  if(db.failCreate)throw Error('timeout');return Response.json(p);
 }
 if(args.method==='PATCH'){
  assert.deepEqual([...args.body.keys()],['shipping_profile_id']);db.remote.shipping_profile_id=Number(args.body.get('shipping_profile_id'));
  if(db.failPatch)throw Error('timeout');return Response.json(db.remote);
 }
 if(path.endsWith('/listings/20'))return Response.json(db.remote);
 return Response.json(db.profiles[path.split('/').at(-1)]);
};
const writeCount=()=>db.calls.filter(c=>c.method!=='GET').length;
const approve=p=>({productId:'p',previewId:p.previewId,confirmShippingChange:true});
test.after(()=>globalThis.fetch=actualFetch);
test('manual US rate copying is exact and rejects missing or unsafe evidence',()=>{
 const p=profile();assert.deepEqual(profileCreateBody(p,'1','US only','USD'),{title:'US only',origin_country_iso:'US',origin_postal_code:'28273',destination_country_iso:'US',primary_cost:'4.99',secondary_cost:'1.99',min_delivery_days:'3',max_delivery_days:'7'});
 for(const mutate of [p=>p.profile_type='calculated',p=>p.shipping_profile_destinations[0].primary_cost=null,p=>p.shipping_profile_upgrades=[{}],p=>p.shipping_profile_destinations.push(p.shipping_profile_destinations[0]),p=>p.origin_postal_code='',p=>p.shipping_profile_destinations[0].secondary_cost.currency_code='EUR']){const p=profile();mutate(p);assert.throws(()=>domesticProfile(p,'1'));}
 assert.throws(()=>domesticProfile(profile(),'1',true));
});
test('preview writes only local review evidence and binds current profile',async()=>{
 setup();const p=await preview({productId:'p',sourceProfileId:'1'});assert.equal(p.state,'PREVIEW_READY');assert.equal(p.preview.domestic.primary.amount,499);assert.equal(writeCount(),0);assert.equal(db.product.listings[0].shippingProfileId,'1');
 db.remote.shipping_profile_id=5;await assert.rejects(preview({productId:'p',sourceProfileId:'1'}));
});
test('approved active and draft listing assignments preserve rates and unrelated fields',async()=>{
 for(const state of ['active','draft']){setup();db.remote.state=state;const before=structuredClone(db.remote),source=structuredClone(db.profiles['1']);const p=await preview({productId:'p',sourceProfileId:'1'});const r=await apply(approve(p));assert.equal(r.state,'SHIPPING_VERIFIED');assert.equal(writeCount(),2);assert.deepEqual(db.profiles['1'],source);assert.deepEqual(db.remote,{...before,shipping_profile_id:2});assert.equal(db.product.listings[0].shippingProfileId,'2');const retry=await apply(approve(p));assert.equal(retry.historical,true);assert.equal(writeCount(),2);}
});
test('compatible existing US-only profiles are reused without creation',async()=>{
 setup();db.profiles['3']=profile(3,true);const p=await preview({productId:'p',sourceProfileId:'1',targetProfileId:'3'});const r=await apply(approve(p));assert.equal(r.state,'SHIPPING_VERIFIED');assert.equal(writeCount(),1);
 setup();db.profiles['3']=profile(3,true);db.profiles['3'].shipping_profile_destinations[0].primary_cost=money(599);await assert.rejects(preview({productId:'p',sourceProfileId:'1',targetProfileId:'3'}));assert.equal(writeCount(),0);
});
test('future physical product receives approved reusable canonical profile',async()=>{
 setup();db.product.listings[0].etsyListingId=null;db.profiles['3']=profile(3,true);const p=await preview({productId:'p',sourceProfileId:'1',targetProfileId:'3'});const r=await apply(approve(p));assert.equal(r.state,'SHIPPING_VERIFIED');assert.equal(r.futureListingConfigured,true);assert.equal(writeCount(),0);assert.equal(db.product.listings[0].shippingProfileId,'3');
});
test('missing approval, disabled mode and expired preview fail closed',async()=>{
 for(const mutate of [()=>db.mode=false,()=>{const p=JSON.parse(db.journals[0].bodyJson);p.expiresAt=new Date(0).toISOString();db.journals[0].bodyJson=JSON.stringify(p);}]){setup();const p=await preview({productId:'p',sourceProfileId:'1'});mutate();await assert.rejects(apply(approve(p)));assert.equal(writeCount(),0);}
 setup();await assert.rejects(apply({productId:'p',previewId:'x',confirmShippingChange:false}));
});
test('changed source, target, canonical or listing blocks writes',async()=>{
 for(const mutate of [()=>db.profiles['1'].shipping_profile_destinations[0].primary_cost=money(599),()=>db.product.title='Changed',()=>db.remote.quantity=8,()=>db.remote.shop_id=100]){setup();const p=await preview({productId:'p',sourceProfileId:'1'});mutate();const r=await apply(approve(p));assert.equal(r.state,'NEEDS_REVIEW');assert.equal(writeCount(),0);}
 setup();db.profiles['3']=profile(3,true);const p=await preview({productId:'p',sourceProfileId:'1',targetProfileId:'3'});db.profiles['3'].shipping_profile_destinations.push({destination_country_iso:'CA'});assert.equal((await apply(approve(p))).state,'NEEDS_REVIEW');assert.equal(writeCount(),0);
});
test('unknown POST outcome cannot create a duplicate on retry',async()=>{
 setup();const p=await preview({productId:'p',sourceProfileId:'1'});db.failCreate=true;assert.equal((await apply(approve(p))).state,'NEEDS_REVIEW');db.failCreate=false;assert.equal((await apply(approve(p))).state,'NEEDS_REVIEW');assert.equal(writeCount(),1);assert.equal(db.remote.shipping_profile_id,1);
});
test('unknown PATCH outcome is recovered by readback without repeating writes',async()=>{
 setup();const p=await preview({productId:'p',sourceProfileId:'1'});db.failPatch=true;assert.equal((await apply(approve(p))).state,'NEEDS_REVIEW');db.failPatch=false;assert.equal((await apply(approve(p))).state,'SHIPPING_VERIFIED');assert.equal(writeCount(),2);
});
test('post-write database failure retains remote ID and verification-only recovery',async()=>{
 setup();const p=await preview({productId:'p',sourceProfileId:'1'});db.failFinalize=true;assert.equal((await apply(approve(p))).state,'NEEDS_REVIEW');db.failFinalize=false;assert.equal(db.product.listings[0].shippingProfileId,'1');assert.equal((await apply(approve(p))).state,'SHIPPING_VERIFIED');assert.equal(writeCount(),2);
});
test('digital/foreign listings cannot be assigned',()=>{
 for(const mutate of [p=>p.listing_type='download',p=>p.shop_id=2,p=>p.state='inactive']){setup();mutate(db.remote);assert.throws(()=>listingSnapshot(db.remote,'20',99));}
});
test('audit paginates physical listings, excludes digital and groups rates',async()=>{
 let calls=0;const read=async path=>{calls++;if(path.endsWith('shipping-profiles'))return {count:1,results:[profile()]};if(path.includes('state=active')){const offset=Number(new URL('https://x'+path).searchParams.get('offset'));return {count:101,results:offset===0?Array.from({length:100},(_,i)=>({listing_id:i+1,shop_id:99,listing_type:i===0?'download':'physical',shipping_profile_id:1})): [{listing_id:101,shop_id:99,listing_type:'physical',shipping_profile_id:1}]};}return {count:0,results:[]};};const r=await auditShipping(99,read);assert.equal(r.profiles[0].listings.length,100);assert.equal(calls,7);assert.equal(r.digitalListingsExcluded,true);
 await assert.rejects(auditShipping(99,async()=>({count:2,results:[]})));
});
test('explicit free shipping is preserved; no missing cost becomes zero',()=>{
 const p=profile();p.shipping_profile_destinations[0].primary_cost=money(0);p.shipping_profile_destinations[0].secondary_cost=money(0);const b=profileCreateBody(p,'1','Free US','USD');assert.equal(b.primary_cost,'0');assert.equal(b.secondary_cost,'0');delete p.shipping_profile_destinations[0].secondary_cost;assert.throws(()=>profileCreateBody(p,'1','US','USD'));
});
test('concurrent apply claims allow only one external mutation sequence',async()=>{
 setup();const p=await preview({productId:'p',sourceProfileId:'1'});const results=await Promise.all([apply(approve(p)),apply(approve(p))]);assert.ok(results.some(r=>r.state==='SHIPPING_VERIFIED'));assert.equal(writeCount(),2);
});
test('post-write international destination or rate drift prevents canonical success',async()=>{
 for(const change of [p=>p.shipping_profile_destinations.push({destination_country_iso:'CA'}),p=>p.shipping_profile_destinations[0].secondary_cost=money(299)]){
  setup();const p=await preview({productId:'p',sourceProfileId:'1'});const fetch=globalThis.fetch;globalThis.fetch=async(url,args)=>{const response=await fetch(url,args);if(args.method==='PATCH')change(db.profiles['2']);return response;};
  try{const r=await apply(approve(p));assert.equal(r.state,'NEEDS_REVIEW');assert.equal(db.product.listings[0].shippingProfileId,'1');}finally{globalThis.fetch=fetch;}
 }
});

const correction = () => ({primaryCost:'8.49',secondaryCost:'3.00',currency:'USD',sourceUrl:'https://www.printful.com/shipping',evidence:'Verified pillow with insert, all offered sizes: first $8.49, additional $3.00.',verifiedAt:new Date(Date.now()-1000).toISOString(),confirmRatesVerified:true});
test('rate correction creates separate profile, verifies exact charges and preserves source',async()=>{
 setup();db.profiles['1']=profile(1,true);const source=structuredClone(db.profiles['1']);
 const p=await preview({productId:'p',sourceProfileId:'1',rateCorrection:correction()});
 assert.equal(p.preview.domestic.primary.amount,499);assert.equal(p.preview.proposedDomestic.primary.amount,849);assert.equal(writeCount(),0);
 const original=globalThis.fetch;globalThis.fetch=async(url,args)=>{const response=await original(url,args);if(args.method==='POST'){db.profiles['2'].shipping_profile_destinations[0].primary_cost=money(849);db.profiles['2'].shipping_profile_destinations[0].secondary_cost=money(300);}return response;};
 try{assert.equal((await apply(approve(p))).state,'SHIPPING_VERIFIED');assert.deepEqual(db.profiles['1'],source);assert.equal(db.calls.find(c=>c.method==='POST').body.primary_cost,'8.49');}finally{globalThis.fetch=original;}
});
test('corrected compatible profile can be reused; original-rate target is blocked',async()=>{
 setup();db.profiles['3']=profile(3,true);await assert.rejects(preview({productId:'p',sourceProfileId:'1',targetProfileId:'3',rateCorrection:correction()}));
 db.profiles['3'].shipping_profile_destinations[0].primary_cost=money(849);db.profiles['3'].shipping_profile_destinations[0].secondary_cost=money(300);
 const p=await preview({productId:'p',sourceProfileId:'1',targetProfileId:'3',rateCorrection:correction()});assert.equal((await apply(approve(p))).state,'SHIPPING_VERIFIED');assert.equal(writeCount(),1);
});
test('invalid, stale, unsupported or undocumented corrections fail before writes',async()=>{
 for(const change of [c=>delete c.evidence,c=>c.primaryCost='8.499',c=>c.secondaryCost='-1.00',c=>c.currency='EUR',c=>c.confirmRatesVerified=false,c=>c.sourceUrl='http://example.com',c=>c.verifiedAt=new Date(0).toISOString(),c=>c.verifiedAt=new Date(Date.now()+86400000).toISOString()]){setup();const c=correction();change(c);await assert.rejects(preview({productId:'p',sourceProfileId:'1',rateCorrection:c}));assert.equal(writeCount(),0);}
});
test('corrected rates require matching remote readback before assignment',async()=>{
 setup();const p=await preview({productId:'p',sourceProfileId:'1',rateCorrection:correction()});assert.equal((await apply(approve(p))).state,'NEEDS_REVIEW');assert.equal(db.remote.shipping_profile_id,1);assert.equal(writeCount(),1);
});
