import test from 'node:test';
import assert from 'node:assert/strict';
import { searchPrintfulCatalog, resolvePrintfulCatalog, quotePrintfulVariant, cents, printfulGet, safePrintfulError } from '../lib/warlock-commerce/printful-catalog.ts';
import { configurePrintfulVariant } from '../lib/warlock-commerce/printful-configuration.ts';
import { runPrintfulSupplierPreflight } from '../lib/warlock-commerce/printful-preflight.ts';
import { withLivePrintfulQuotes } from '../lib/warlock-commerce/live-quotes.ts';
import { evaluateCommerceGates } from '../lib/warlock-commerce/gates.ts';
const product={id:71,title:'Unisex Shirt Bella Canvas 3001',brand:'Bella Canvas',model:'3001',type_name:'T-shirt',techniques:[{key:'DTG',is_default:true}],files:[{id:'default',type:'front',additional_price:null}],options:[]};
const variant={id:4011,product_id:71,name:'Black / M',color:'Black',size:'M'};
function fixtures({cost='12.34',availability='in stock',currency='USD',identity=4011,region='north_america',surcharge=null,technique='dtg'}={}) {
 let calls=[];
 const get=async(path,store)=>{calls.push([path,store]);
  if(path==='/stores')return {result:[{id:99,name:'Spellmark'}]};
  if(path==='/products')return {result:[product,{...product,id:72,title:'Poster',brand:'Other',model:'Print'}]};
  if(path==='/products/71')return {result:{product,variants:[variant,{...variant,id:4012,color:'White',size:'L'}]}};
  if(path==='/products/variant/4011')return {result:{variant,product:{...product,techniques:[{key:technique,is_default:true}],files:[{id:'default',type:'front',additional_price:surcharge}]}}};
  if(path.includes('/prices'))return {data:{currency,product:{id:71,placements:[{id:'front',technique_key:technique,layers:[{type:'file',additional_price:'0.00'}]}]},variant:{id:identity,techniques:[{technique_key:technique,price:cost,discounted_price:cost}]}}};
  if(path.includes('/availability'))return {data:{techniques:[{technique,selling_regions:[{name:region,availability}]}]}};
  throw Error('unexpected path');
 };return {get,calls};
}
const selection={storeId:99,productId:71,catalogVariantId:4011};
test('catalog search and exact size/color resolution return supplier IDs without a fixed price',async()=>{
 const {get}=fixtures();const stores=await searchPrintfulCatalog({query:"shirt"},get);assert.equal(stores.stores[0].storeId,99);assert.ok(!stores.products);const found=await searchPrintfulCatalog({storeId:99,query:'Bella 3001'},get);assert.equal(found.total,1);assert.equal(found.products[0].productId,71);assert.ok(!('price' in found.products[0]));
 const resolved=await resolvePrintfulCatalog({storeId:99,productId:71,colors:['BLACK'],sizes:['m']},get);assert.deepEqual(resolved.variants.map(v=>v.catalogVariantId),[4011]);assert.deepEqual(resolved.availableSizes,['M','L']);
 assert.equal((await resolvePrintfulCatalog({storeId:99,productId:71,sizes:['XXXL']},get)).variants.length,0);
});
test('live quote is decimal-safe, scoped to selected store, default technique and North America',async()=>{
 const {get,calls}=fixtures();const q=await quotePrintfulVariant(selection,get);assert.equal(q.productionBaseCents,1234);assert.equal(q.currency,'USD');assert.equal(q.technique,'dtg');assert.equal(q.fileType,'front');assert.equal(q.availability,'in_stock');assert.ok(q.exclusions.includes('Shipping'));assert.ok(calls.some(([p,s])=>p.includes('currency=USD')&&s===99));
 for(const v of [null,'','NaN','1e3','1.234','-1.00','99999999999'])assert.throws(()=>cents(v));assert.equal(cents('0.29'),29);
});
test('quotes reject mismatched identity, currency, surcharge, unsupported setup and inaccessible stores',async()=>{
 for(const bad of [{identity:4012},{currency:'EUR'},{surcharge:'2.00'},{technique:'embroidery'}])await assert.rejects(quotePrintfulVariant(selection,fixtures(bad).get));
 await assert.rejects(quotePrintfulVariant({...selection,storeId:100},fixtures().get),/store_not_accessible/);
 assert.equal((await quotePrintfulVariant(selection,fixtures({region:'europe'}).get)).availability,'unknown');
 assert.equal((await quotePrintfulVariant(selection,fixtures({availability:'out of stock'}).get)).availability,'unavailable');
});
test('request uses no-store and never follows credential-bearing redirects or leaks upstream errors',async()=>{
 const oldFetch=globalThis.fetch, oldToken=process.env.PRINTFUL_PRIVATE_TOKEN;process.env.PRINTFUL_PRIVATE_TOKEN='fixture-only';
 globalThis.fetch=async(url,options)=>{assert.equal(options.cache,'no-store');assert.equal(options.redirect,'error');assert.equal(options.headers['X-PF-Store-Id'],'99');return new Response('private upstream failure',{status:429});};
 try {await assert.rejects(printfulGet('/products',99),/^Error: printful_http_429$/);globalThis.fetch=async()=>new Response('sensitive malformed response');await assert.rejects(printfulGet('/products',99),/^Error: printful_invalid_response$/);assert.equal(safePrintfulError(new Error('postgresql://secret')),'printful_request_failed');}finally{globalThis.fetch=oldFetch;if(oldToken===undefined)delete process.env.PRINTFUL_PRIVATE_TOKEN;else process.env.PRINTFUL_PRIVATE_TOKEN=oldToken;}
});
const canonical={id:'v1',productId:'p1',fulfillment:'PHYSICAL',label:'Black / M',printfulProductId:71,printfulVariantId:4011,printfulStoreId:99,etsyListingId:null,retailPriceCents:3000,productionBaseCents:100,productionQuotedAt:new Date('2020-01-01'),updatedAt:new Date()};
test('configuration saves API quote provenance while retaining the approved retail price and guards concurrent changes',async()=>{
 let saved;const db={spellmarkVariant:{findFirst:async()=>({...canonical}),updateMany:async args=>{saved=args;return {count:1};}}};
 const quote=async()=>quotePrintfulVariant(selection,fixtures().get);
 const input={productId:'p1',variantId:'v1',catalogProductId:71,catalogVariantId:4011,storeId:99};
 const result=await configurePrintfulVariant(input,db,quote);assert.equal(result.retailPriceCents,3000);assert.equal(saved.data.productionBaseCents,1234);assert.equal(JSON.parse(saved.data.productionQuoteJson).sellingRegion,'north_america');assert.ok(!('retailPriceCents' in saved.data));assert.equal(saved.where.retailPriceCents,3000);
 db.spellmarkVariant.updateMany=async()=>({count:0});await assert.rejects(configurePrintfulVariant(input,db,quote),/configuration_changed_retry/);
 db.spellmarkVariant.findFirst=async()=>null;await assert.rejects(configurePrintfulVariant(input,db,quote),/not_owned/);
 db.spellmarkVariant.findFirst=async()=>({...canonical,etsyListingId:'etsy-existing'});await assert.rejects(configurePrintfulVariant({...input,catalogVariantId:4012},db,quote),/mapping_locked/);
});
test('preflight fetches new prices each time; raised costs replace stale saved quotes and block margin',async()=>{
 const manifest={id:'p1',variants:[canonical],listings:[]};
 const first=await runPrintfulSupplierPreflight(manifest,fixtures({cost:'5.00'}).get);assert.equal(first.pass,true);
 const fresh=withLivePrintfulQuotes(manifest,first);assert.equal(fresh.variants[0].productionBaseCents,500);assert.equal(evaluateCommerceGates(fresh).margin.pass,true);
 const second=await runPrintfulSupplierPreflight(manifest,fixtures({cost:'28.00'}).get);assert.equal(second.pass,true);
 const raised=withLivePrintfulQuotes(manifest,second);const gates=evaluateCommerceGates(raised);assert.equal(gates.margin.pass,false);assert.ok(gates.errors.some(e=>e.code==='contribution_margin_below_floor'));assert.equal(raised.variants[0].retailPriceCents,3000);assert.equal(manifest.variants[0].productionBaseCents,100);
 const gone=await runPrintfulSupplierPreflight(manifest,fixtures({availability:'out of stock'}).get);assert.equal(gone.pass,false);assert.throws(()=>withLivePrintfulQuotes(manifest,gone));
 const stale=structuredClone(second);stale.variants[0].quote.quotedAt='2020-01-01';assert.throws(()=>withLivePrintfulQuotes(manifest,stale),/expired/);
});
test('saved configuration changes and upstream failures block supplier preflight',async()=>{
 const q=await quotePrintfulVariant(selection,fixtures().get);
 const changed={...canonical,productionQuoteJson:JSON.stringify({...q,fileType:'back'})};
 assert.equal((await runPrintfulSupplierPreflight({variants:[changed]},fixtures().get)).pass,false);
 const failed=await runPrintfulSupplierPreflight({variants:[canonical]},async()=>{throw Error('printful_http_429');});assert.equal(failed.pass,false);assert.ok(failed.errors[0].includes('printful_http_429'));
});

test('only discovery caches results, isolated by token and store',async()=>{
 const oldFetch=globalThis.fetch,oldToken=process.env.PRINTFUL_PRIVATE_TOKEN;let requests=0;
 globalThis.fetch=async url=>{requests++;return Response.json(String(url).endsWith('/stores')?{result:[{id:99}]}:{result:[product]});};
 process.env.PRINTFUL_PRIVATE_TOKEN='catalog-cache-fixture-unique';
 try {
  await searchPrintfulCatalog({query:'shirt',storeId:99});await searchPrintfulCatalog({query:'shirt',storeId:99});assert.equal(requests,2);
  process.env.PRINTFUL_PRIVATE_TOKEN='catalog-cache-fixture-other';await searchPrintfulCatalog({query:'shirt',storeId:99});assert.equal(requests,4);
 }finally{globalThis.fetch=oldFetch;if(oldToken===undefined)delete process.env.PRINTFUL_PRIVATE_TOKEN;else process.env.PRINTFUL_PRIVATE_TOKEN=oldToken;}
});

function configuredFixtures({base='20.00',sleeve='3.25',options=[],files,order,defaultTechnique='dtg'}={}) {
 const baseFixture=fixtures({cost:base,technique:defaultTechnique});
 const sync={id:5000000001,sync_product_id:4000000001,synced:true,variant_id:4011,options,files:files ?? [{id:81,type:'back',status:'ok',options:[]},{id:82,type:'sleeve_right',status:'ok',options:[]}]};
 const get=async(path,store)=>{
  if(path.startsWith('/sync/variant/'))return {result:{sync_variant:sync}};
  if(path==='/v2/catalog-products/71')return {data:{id:71,placements:order ?? ['front','back','sleeve_right'].map(placement=>({placement,technique:'dtg'}))}};
  const response=await baseFixture.get(path,store);
  if(path==='/products/variant/4011')response.result.product.files.push({id:'back',type:'back',additional_price:'5.00'},{id:'sleeve_right',type:'sleeve_right',additional_price:'3.25'});
  if(path.includes('/prices'))response.data.product.placements.push(...['back','sleeve_right'].map(id=>({id,technique_key:'dtg',price:id==='back'?'5.00':sleeve,discounted_price:id==='back'?'5.00':sleeve,layers:[{type:'file',additional_price:'0.00'}]})));
  if(path.includes('/prices'))Object.assign(response.data.product.placements[0],{price:'5.00',discounted_price:'5.00'});
  return response;
 };return {get,sync};
}
const configuredSelection={...selection,syncVariantId:5000000001};
test('configured back and sleeve quote includes live extra placement fees once, without frozen supplier prices',async()=>{
 const a=await quotePrintfulVariant(configuredSelection,configuredFixtures().get);
 assert.equal(a.productionBaseCents,2325);assert.equal(a.configurationKind,'CONFIGURED_SYNC');assert.equal(a.includedPlacementCents,500);assert.deepEqual(a.placements.map(p=>p.placement),['back','sleeve_right']);assert.ok(!a.exclusions.includes('Additional placements and options'));
 const b=await quotePrintfulVariant(configuredSelection,configuredFixtures({base:'22.00',sleeve:'4.00'}).get);assert.equal(b.productionBaseCents,2600);assert.equal(a.configurationFingerprint,b.configurationFingerprint);
 // First selected placement follows catalog ordering, not the order of files.
 const c=await quotePrintfulVariant(configuredSelection,configuredFixtures({order:['front','sleeve_right','back'].map(placement=>({placement,technique:'dtg'}))}).get);assert.equal(c.productionBaseCents,2500);
});
test('configured single default non-DTG products retain supported base pricing',async()=>{
 const q=await quotePrintfulVariant(configuredSelection,configuredFixtures({defaultTechnique:'digital',files:[{id:81,type:'default',status:'ok',options:[]}]}).get);
 assert.equal(q.productionBaseCents,2000);assert.equal(q.configurationKind,'CONFIGURED_SYNC');
});
test('inactive DTG embroidery defaults retain fingerprints while back and sleeve fees refresh live',async()=>{
 const options=[{id:'embroidery_type',value:'flat'},{id:'thread_colors',value:[]},{id:'thread_colors_back',value:['#000000']},{id:'notes',value:''},{id:'lifelike',value:true}];
 const f=configuredFixtures({options});f.sync.files[0].options=[{id:'auto_thread_color',value:true},{id:'full_color',value:false}];
 const before=structuredClone(f.sync),a=await quotePrintfulVariant(configuredSelection,f.get);
 assert.equal(a.productionBaseCents,2325);assert.ok(a.inactiveOptionIds.includes('product:embroidery_type'));assert.ok(a.inactiveOptionIds.includes('file:auto_thread_color'));assert.deepEqual(f.sync,before);
 const b=configuredFixtures({base:'22.00',sleeve:'4.00',options});b.sync.files[0].options=before.files[0].options;
 const fresh=await quotePrintfulVariant(configuredSelection,b.get);assert.equal(fresh.productionBaseCents,2600);assert.equal(a.configurationFingerprint,fresh.configurationFingerprint);
 const v={...canonical,printfulSyncVariantId:5000000001,productionQuoteJson:JSON.stringify(a)};
 assert.equal((await runPrintfulSupplierPreflight({variants:[v]},b.get)).pass,true);
 b.sync.options[1].value=['#FFFFFF'];assert.equal((await runPrintfulSupplierPreflight({variants:[v]},b.get)).pass,false);
});
test('unknown, paid, malformed, misplaced and active embroidery options fail with bounded option diagnostics',async()=>{
 for(const options of [[{id:'inside_pocket',value:true}],[{id:'embroidery_type',value:'3d'}],[{id:'notes',value:'Please edit the artwork'}],[{id:'thread_colors',value:['not a color']}],[{id:'full_color',value:false}],[{id:'notes',value:''},{id:'notes',value:''}],{id:'notes',value:''}]){
  await assert.rejects(quotePrintfulVariant(configuredSelection,configuredFixtures({options}).get),/printful_configured_(?:product_option_quote_unsupported_[a-z_]+|options_malformed)/);
 }
 const f=configuredFixtures();f.sync.files[0].options=[{id:'full_color',value:true}];await assert.rejects(quotePrintfulVariant(configuredSelection,f.get),/printful_configured_file_option_quote_unsupported_full_color/);
 const nonDtg=configuredFixtures({defaultTechnique:'digital',files:[{id:81,type:'default',status:'ok',options:[]}],options:[{id:'embroidery_type',value:'flat'}]});await assert.rejects(quotePrintfulVariant(configuredSelection,nonDtg.get),/printful_configured_product_option_quote_unsupported_embroidery_type/);
 const secret=configuredFixtures({options:[{id:'https://secret.example/token',value:'secret'}]});await assert.rejects(quotePrintfulVariant(configuredSelection,secret.get),/^Error: printful_configured_options_malformed$/);
});
test('configuration options, unknown placements, malformed/foreign sync identities block refresh without modifying saved costs',async()=>{
 for(const change of [f=>f.sync.options=[{id:'paid-option',value:true}],f=>f.sync.files[0].type='inside_label',f=>f.sync.id=99,f=>f.sync.variant_id=123,f=>f.sync.files[0].status='failed',f=>f.sync.synced=false]){
  const f=configuredFixtures();change(f);await assert.rejects(quotePrintfulVariant(configuredSelection,f.get),/printful_/);
  const v={...canonical,printfulSyncVariantId:5000000001,productionBaseCents:3048};assert.equal((await runPrintfulSupplierPreflight({variants:[v]},f.get)).pass,false);assert.equal(v.productionBaseCents,3048);
 }
});
test('preflight upgrades a default snapshot to configured placement pricing and blocks configured drift or removal',async()=>{
 const old=await quotePrintfulVariant(selection,fixtures().get),f=configuredFixtures();
 const v={...canonical,printfulSyncVariantId:5000000001,productionQuoteJson:JSON.stringify(old)};
 const fresh=await runPrintfulSupplierPreflight({variants:[v]},f.get);assert.equal(fresh.pass,true);assert.equal(withLivePrintfulQuotes({variants:[v]},fresh).variants[0].productionBaseCents,2325);
 v.productionQuoteJson=JSON.stringify(fresh.variants[0].quote);f.sync.files[0].id=90;assert.equal((await runPrintfulSupplierPreflight({variants:[v]},f.get)).pass,false);
 f.sync.files=[];f.sync.synced=false;assert.equal((await runPrintfulSupplierPreflight({variants:[v]},f.get)).pass,false);
});
test('explicit configure refresh quotes the stored large sync ID and saves full cost without changing retail',async()=>{
 let saved;const before={...canonical,printfulSyncVariantId:'5000000001'};
 const db={spellmarkVariant:{findFirst:async()=>before,updateMany:async args=>{saved=args;return {count:1};}}};
 const q=async input=>{assert.equal(input.syncVariantId,5000000001);return quotePrintfulVariant(input,configuredFixtures().get);};
 await configurePrintfulVariant({productId:'p1',variantId:'v1',catalogProductId:71,catalogVariantId:4011,storeId:99},db,q);
 assert.equal(saved.data.productionBaseCents,2325);assert.equal(saved.where.printfulSyncVariantId,'5000000001');assert.ok(!('retailPriceCents' in saved.data));
});
