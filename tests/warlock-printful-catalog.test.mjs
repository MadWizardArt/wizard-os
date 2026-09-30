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
