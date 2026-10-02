import test from 'node:test';
import assert from 'node:assert/strict';
import { intakeProduct } from '../lib/warlock-intake.ts';
import { permittedIntakeUrl, readIntakeBytes } from '../lib/warlock-intake-assets.ts';
import { evaluateCommerceGates } from '../lib/warlock-commerce/gates.ts';
import { validateWarlockManifest } from '../lib/warlock-mcp/manifest.ts';
function database() {
  let state = { products: [], variants: [], listings: [], assets: [], links: [] }; let seq = 0;
  const tables = { spellmarkProduct:'products', spellmarkVariant:'variants', spellmarkListing:'listings', spellmarkAsset:'assets', spellmarkListingAsset:'links' };
  function match(row, where = {}) { return Object.entries(where).every(([k,v]) => k === 'productId_fulfillment' ? match(row,v) : row[k] === v); }
  const tx = { $queryRaw: async () => [] };
  for (const [name, key] of Object.entries(tables)) {
    tx[name] = {
      findMany: async ({where, include, take}={}) => state[key].filter(r=>match(r,where)).slice(0,take ?? Infinity).map(r=>include ? {...r, variants:state.variants.filter(v=>v.productId===r.id),listings:state.listings.filter(l=>l.productId===r.id),assets:state.links.filter(l=>l.listingId===r.id)} : {...r}),
      findFirst: async args => (await tx[name].findMany(args))[0] ?? null,
      create: async ({data}) => { const row = {id:'test'+ ++seq,...data}; state[key].push(row); return {...row}; },
      update: async ({where,data}) => { const row=state[key].find(r=>match(r,where)); if(!row) throw Error('missing'); Object.assign(row,data); return {...row}; },
      count: async args => (await tx[name].findMany(args)).length,
      upsert: async ({where,create,update}) => state[key].some(r=>match(r,where)) ? tx[name].update({where,data:update}) : tx[name].create({data:create}),
    };
  }
  return { tx, state:()=>state, $transaction:async callback=> { const before=structuredClone(state);try{return await callback(tx);}catch(e){state=before;throw e;} } };
}
const png = Buffer.from([137,80,78,71,13,10,26,10,1,2,3]);
let uploads=0;
const files = { read:readIntakeBytes, verify:async()=>{}, save:async(productId,asset,data)=> { uploads++;return {role:asset.role,fileName:asset.name,pathname:`warlock/${productId}/intake/${asset.role}/${data.digest}/${asset.name}`,blobUrl:`https://blob.test/${productId}/${asset.role}/${data.digest}/${asset.name}`,byteSize:data.bytes.length,contentType:data.contentType}; } };
const asset = (role,name)=>({role,name,base64:png.toString('base64')});
const input = {confirmIntake:true,product:{title:'Luna Noctiluca'},variants:[{fulfillment:'DIGITAL',label:'Digital'}],listing:{listingType:'download',title:'Luna — Digital Version',description:'Moon owl.',price:9,tags:['owl art']},assets:[asset('master','master.png'),asset('hero','hero.png'),asset('customer_file','download.png')]};
function manifest(db) {const s=db.state();return {...s.products[0],assets:s.assets,variants:s.variants,listings:s.listings.map(l=>({...l,assets:s.links.filter(a=>a.listingId===l.id).map(a=>({...a,asset:s.assets.find(x=>x.id===a.assetId)}))}))};}
test('new package materializes listing, price and private links; retry preserves IDs',async()=> {
 const db=database();uploads=0;const first=await intakeProduct(input,db,files);const ids=structuredClone(db.state());const again=await intakeProduct({...input,productId:first.productId},db,files);
 assert.equal(again.productId,first.productId);assert.deepEqual(db.state(),ids);assert.equal(uploads,3);assert.equal(db.state().variants[0].retailPriceCents,900);assert.equal(db.state().links.length,2);
 assert.equal(validateWarlockManifest(manifest(db)).ready,true);
 const gates=evaluateCommerceGates(manifest(db));assert.ok(!gates.errors.some(e=>['listing_manifest_missing','retail_price_missing','listing_images_missing','digital_customer_files_missing'].includes(e.code)));assert.ok(gates.errors.some(e=>e.code==='listing_taxonomy_missing'));
});
test('existing shell completed and omitted mappings, prices, product data survive partial retry',async()=> {
 const db=database();await intakeProduct({confirmIntake:true,product:{title:'Luna Noctiluca',collection:'Cabinet'},variants:input.variants},db,files);
 const id=db.state().products[0].id;await intakeProduct({...input,productId:id},db,files);assert.equal(db.state().products.length,1);assert.equal(db.state().products[0].collection,'Cabinet');
 await intakeProduct({confirmIntake:true,productId:id,product:{title:'Luna Noctiluca'},variants:input.variants},db,files);assert.equal(db.state().variants[0].retailPriceCents,900);
});
test('mixed physical and digital listings retain edition prices and customer links stay digital',async()=> {
 const db=database();await intakeProduct({...input,listing:undefined,variants:[...input.variants,...[2400,2800,6900].map((p,i)=>({fulfillment:'PHYSICAL',label:`Edition ${i}`,retailPriceCents:p,printfulProductId:1,printfulVariantId:i+1,printfulStoreId:2,productionBaseCents:1000,productionQuotedAt:new Date().toISOString()}))],listings:[input.listing,{fulfillment:'PHYSICAL',description:'Physical art.'}]},db,files);
 assert.deepEqual(db.state().variants.map(v=>v.retailPriceCents),[900,2400,2800,6900]);assert.equal(db.state().listings.length,2);assert.equal(db.state().links.length,3);
});
test('failed linking rolls back canonical changes and a corrected retry succeeds',async()=> {
 const db=database();await assert.rejects(intakeProduct({...input,assets:[{...asset('hero','hero.png'),fulfillment:'PHYSICAL'}]},db,files),/asset_listing_missing/);assert.equal(db.state().products.length,0);await intakeProduct(input,db,files);assert.equal(db.state().assets.length,3);
});
test('foreign assets, duplicate labels, ambiguous titles and executed listings fail closed',async()=> {
 const db=database();await intakeProduct(input,db,files);
 await assert.rejects(intakeProduct({...input,assets:[{role:'hero',assetId:'foreign'}]},db,files),/asset_not_owned/);
 await assert.rejects(intakeProduct({...input,variants:[...input.variants,...input.variants]},db,files),/duplicate_variant_label/);
 await db.tx.spellmarkProduct.create({data:input.product});await assert.rejects(intakeProduct(input,db,files),/product_title_ambiguous/);
 await db.tx.spellmarkListing.update({where:{id:db.state().listings[0].id},data:{etsyListingId:'123'}});await assert.rejects(intakeProduct({...input,productId:db.state().products[0].id},db,files),/intake_locked/);
});
test('source restrictions and byte validation reject unsafe references and bogus files',async()=> {
 for(const url of ['http://127.0.0.1/file','https://localhost/file','https://evil.example/file','https://u:p@x.oaiusercontent.com/f'])assert.throws(()=>permittedIntakeUrl(url),/asset_source_not_allowed/);
 assert.equal(permittedIntakeUrl('https://sdmntprabc.oaiusercontent.com/a').protocol,'https:');
 await assert.rejects(readIntakeBytes({role:'hero',name:'hero.png',base64:Buffer.from('not an image').toString('base64')}),/asset_file_type_unsupported/);
 await assert.rejects(intakeProduct({...input,confirmIntake:false},database(),files));
});
test('native ChatGPT files download bytes and persist private assets instead of treating attachment IDs as canonical IDs', async () => {
 const originalFetch = globalThis.fetch; const seen = [];
 globalThis.fetch = async url => { seen.push(String(url)); return new Response(png, {headers:{'content-type':'image/png'}}); };
 try {
  const db=database(); const native={...input,files:[{file_id:'file_native',download_url:'https://files.oaiusercontent.com/authorized.png',file_name:'Luna Master.png',mime_type:'image/png'}],assets:[{role:'master',fileId:'file_native'},{role:'hero',fileId:'file_native'},asset('customer_file','download.png')]};
  await intakeProduct(native,db,files);await intakeProduct(native,db,files);
  assert.equal(db.state().assets.length,3);assert.equal(db.state().assets[0].fileName,'Luna_Master.png');assert.equal(db.state().links.length,2);assert.ok(seen.every(u=>u==='https://files.oaiusercontent.com/authorized.png'));assert.equal(validateWarlockManifest(manifest(db)).ready,true);
 } finally {globalThis.fetch=originalFetch;}
});
test('bare ChatGPT file IDs, missing file objects, and missing file roles fail with actionable errors', async () => {
 const db=database();
 await assert.rejects(intakeProduct({...input,assets:[{role:'hero',assetId:'file_native'}]},db,files),/chatgpt_file_id_is_not_warlock_asset_id/);
 await assert.rejects(intakeProduct({...input,assets:[{role:'hero',fileId:'file_native'}]},db,files),/chatgpt_file_input_missing/);
 await assert.rejects(intakeProduct({...input,files:[{file_id:'file_native',download_url:'https://files.oaiusercontent.com/a'}]},db,files),/chatgpt_file_role_missing/);
 assert.equal(db.state().products.length,0);
});

test('single-file attachment completes an existing product without altering verified listings, variants or prices', async () => {
 const { attachmentIntake } = await import('../lib/warlock-attachment.ts');
 const db=database();await intakeProduct({...input,assets:[]},db,files);
 const product=db.state().products[0];
 await db.tx.spellmarkListing.update({where:{id:db.state().listings[0].id},data:{status:'VERIFIED',taxonomyId:123}});
 const before=structuredClone({variants:db.state().variants,listings:db.state().listings});
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async()=>new Response(png,{headers:{'content-type':'image/png'}});
 try {
  for(const role of ['master','hero','customer_file']) {
   const raw={productId:product.id,file:{file_id:`file_${role}`,download_url:'https://files.oaiusercontent.com/a',file_name:`${role}.png`},role,confirmAttachment:true};
   await intakeProduct(attachmentIntake(raw,product),db,files);
   await intakeProduct(attachmentIntake(raw,product),db,files);
  }
  assert.equal(db.state().assets.length,3);assert.equal(db.state().links.length,2);
  assert.deepEqual(db.state().variants,before.variants);assert.deepEqual(db.state().listings,before.listings);
  assert.equal(validateWarlockManifest(manifest(db)).ready,true);
  assert.throws(()=>attachmentIntake({productId:product.id,file:'file_master',role:'master',confirmAttachment:true},product));
  assert.throws(()=>attachmentIntake({productId:'foreign',file:{file_id:'file_x',download_url:'https://files.oaiusercontent.com/a'},role:'master',confirmAttachment:true},product),/attachment_product_mismatch/);
 } finally {globalThis.fetch=originalFetch;}
});

test('made-to-order intake prepares custom digital work without an unfinished customer file and preserves delivery mode on retry',async()=>{
 const db=database(),custom={...input,listing:{...input.listing,digitalDelivery:'MADE_TO_ORDER'},assets:[asset('hero','hero.png')]};
 const accepted=await intakeProduct(custom,db,files);assert.equal(db.state().listings[0].whenMade,'made_to_order');assert.equal(db.state().listings[0].digitalDelivery,'MADE_TO_ORDER');assert.equal(validateWarlockManifest(manifest(db)).ready,true);
 await intakeProduct({confirmIntake:true,productId:accepted.productId,product:input.product,assets:[]},db,files);assert.equal(db.state().listings[0].digitalDelivery,'MADE_TO_ORDER');
 await assert.rejects(intakeProduct({...custom,productId:accepted.productId,assets:[asset('customer_file','placeholder.png')]},db,files),/cannot_have_listing_downloads/);
 assert.equal(db.state().assets.length,1);
});
test('delivery-mode switch with existing instant file links is rejected atomically',async()=>{
 const db=database();await intakeProduct(input,db,files);const before=structuredClone(db.state());
 await assert.rejects(intakeProduct({...input,listing:{...input.listing,digitalDelivery:'MADE_TO_ORDER'},assets:[]},db,files),/cannot_have_listing_downloads/);assert.deepEqual(db.state(),before);
});
