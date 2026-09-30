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
 console.log('Intake database integration: canonical completion, concurrent retry, persistence, authorization and rollback passed.');
} finally {await pool.query('DELETE FROM "SpellmarkProduct" WHERE title=$1',[title]);await pool.end();}
