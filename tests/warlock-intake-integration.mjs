import assert from 'node:assert/strict';
import pg from 'pg';
const base = 'http://127.0.0.1:3000';
const pool = new pg.Pool({connectionString:process.env.DATABASE_URL});
const title = `CI intake ${Date.now()}`;
const headers = {'content-type':'application/json','x-warlock-api-key':process.env.WARLOCK_API_KEY};
const body = {confirmIntake:true,product:{title},variants:[{fulfillment:'DIGITAL',label:'Download'}]};
async function intake(payload) {const response=await fetch(`${base}/api/warlock/intake`,{method:'POST',headers,body:JSON.stringify(payload)});const data=await response.json();assert.ok(response.ok,JSON.stringify(data));return data;}
try {
 const denied=await fetch(`${base}/api/warlock/intake`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});assert.equal(denied.status,401);
 const first=await intake(body);
 const completion={...body,productId:first.productId,listing:{listingType:'download',title:'Moon Download',description:'Test package',price:9,tags:['moon']}};
 await Promise.all([intake(completion),intake(completion)]);
 const product=await pool.query('SELECT id FROM "SpellmarkProduct" WHERE title=$1',[title]);assert.equal(product.rows.length,1);
 const variants=await pool.query('SELECT * FROM "SpellmarkVariant" WHERE "productId"=$1',[first.productId]);assert.equal(variants.rows.length,1);assert.equal(variants.rows[0].retailPriceCents,900);
 const listings=await pool.query('SELECT * FROM "SpellmarkListing" WHERE "productId"=$1',[first.productId]);assert.equal(listings.rows.length,1);assert.equal(listings.rows[0].status,'CONFIG');assert.equal(listings.rows[0].title,'Moon Download');assert.match(listings.rows[0].description,/AI/);
 // Missing/foreign assets roll back the preceding pricing and listing changes.
 const failed=await fetch(`${base}/api/warlock/intake`,{method:'POST',headers,body:JSON.stringify({...completion,listing:{...completion.listing,price:12},assets:[{role:'hero',assetId:'foreign'}]})});assert.equal(failed.status,400);
 const unchanged=await pool.query('SELECT "retailPriceCents" FROM "SpellmarkVariant" WHERE "productId"=$1',[first.productId]);assert.equal(unchanged.rows[0].retailPriceCents,900);
 // Opaque supplier sync IDs larger than int32 survive the real DB and MCP repository.
 await pool.query('UPDATE "SpellmarkVariant" SET "printfulSyncVariantId"=$1 WHERE id=$2',['5000000001',variants.rows[0].id]);
 await pool.query('UPDATE "SpellmarkListing" SET "printfulSyncProductId"=$1 WHERE id=$2',['4000000001',listings.rows[0].id]);
 const stored=await pool.query('SELECT "printfulSyncVariantId" FROM "SpellmarkVariant" WHERE id=$1',[variants.rows[0].id]);assert.equal(stored.rows[0].printfulSyncVariantId,'5000000001');
 // Dated quote provenance survives the real DB and canonical MCP repository.
 const quote={source:'Printful Catalog API v2',currency:'USD',sellingRegion:'north_america',quotedAt:new Date().toISOString(),productionBaseCents:1234};
 await pool.query('UPDATE "SpellmarkVariant" SET "productionQuoteJson"=$1 WHERE id=$2',[JSON.stringify(quote),variants.rows[0].id]);
 const listed=await fetch(`${base}/api/warlock/mcp`,{method:'POST',headers:{...headers,accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'get_product',arguments:{productId:first.productId}}})});
 assert.equal(listed.status,200);
 const rpcBody=await listed.text();const line=rpcBody.split('\n').find(l=>l.startsWith('data: '));const rpc=JSON.parse(line?line.slice(6):rpcBody);
 const canonical=rpc.result.structuredContent.product;
 assert.deepEqual(JSON.parse(canonical.variants[0].productionQuoteJson),quote);
 assert.equal(canonical.variants[0].retailPriceCents,900);
 assert.equal(canonical.variants[0].printfulSyncVariantId,5000000001);
 assert.equal(canonical.listings[0].printfulSyncProductId,4000000001);
 console.log('Intake database integration: canonical completion, concurrent retry, persistence, authorization and rollback passed.');
} finally {await pool.query('DELETE FROM "SpellmarkProduct" WHERE title=$1',[title]);await pool.end();}
