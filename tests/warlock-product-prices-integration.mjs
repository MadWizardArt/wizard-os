import assert from 'node:assert/strict';
import pg from 'pg';
const base='http://127.0.0.1:3000',pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
const headers={'content-type':'application/json','accept':'application/json, text/event-stream','x-warlock-api-key':process.env.WARLOCK_API_KEY};
const title=`CI post-draft prices ${Date.now()}`;
async function call(name,args,authenticated=true){
 const h={...headers};if(!authenticated)delete h['x-warlock-api-key'];
 const response=await fetch(base+'/api/warlock/mcp',{method:'POST',headers:h,body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})});
 if(!authenticated){assert.equal(response.status,401);return;}
 assert.equal(response.status,200);const text=await response.text(),line=text.split('\n').find(l=>l.startsWith('data: '));return JSON.parse(line?line.slice(6):text).result;
}
try{
 const created=await fetch(base+'/api/warlock/intake',{method:'POST',headers,body:JSON.stringify({confirmIntake:true,product:{title},variants:[{fulfillment:'PHYSICAL',label:'2XL',retailPriceCents:5700},{fulfillment:'PHYSICAL',label:'3XL',retailPriceCents:5700}],listing:{fulfillment:'PHYSICAL',listingType:'physical',title,description:'Test',price:57}})});
 assert.ok(created.ok,await created.clone().text());const {productId}=await created.json();
 await pool.query('UPDATE "SpellmarkListing" SET "etsyListingId"=$1,status=$2,"printfulSyncProductId"=$3 WHERE "productId"=$4',['4586039819','SYNCED','4000000001',productId]);
 await pool.query('UPDATE "SpellmarkVariant" SET "etsyListingId"=$1,"printfulSyncVariantId"=$2,"productionBaseCents"=$3,"productionQuoteJson"=$4 WHERE "productId"=$5',['4586039819','5000000001',3248,'configured quote',productId]);
 const before=(await pool.query('SELECT * FROM "SpellmarkVariant" WHERE "productId"=$1 ORDER BY label',[productId])).rows;
 const args={productId,confirmPrices:true,prices:before.map(v=>({variantId:v.id,expectedRetailPriceCents:5700,retailPriceCents:5744}))};
 await call('update_product_prices',args,false);
 const locked=await call('intake_product',{productId,confirmIntake:true,product:{title},variants:[]});assert.equal(locked.isError,true);assert.match(locked.content[0].text,/intake_locked_after_draft_execution/);
 const wrong=structuredClone(args);wrong.prices[1].variantId='foreign';assert.equal((await call('update_product_prices',wrong)).isError,true);
 assert.deepEqual((await pool.query('SELECT "retailPriceCents" FROM "SpellmarkVariant" WHERE "productId"=$1',[productId])).rows.map(v=>v.retailPriceCents),[5700,5700]);
 const updated=await call('update_product_prices',args);assert.equal(updated.structuredContent.state,'CANONICAL_PRICES_SAVED');assert.equal(updated.structuredContent.etsyMutated,false);
 const after=(await pool.query('SELECT * FROM "SpellmarkVariant" WHERE "productId"=$1 ORDER BY label',[productId])).rows;
 after.forEach((v,n)=>{assert.equal(v.retailPriceCents,5744);for(const key of Object.keys(v).filter(k=>!['retailPriceCents','updatedAt'].includes(k)))assert.deepEqual(v[key],before[n][key],key);});
 assert.ok((await call('update_product_prices',args)).structuredContent.prices.every(p=>!p.changed));
 const requests=[6000,6100].map(target=>({...args,prices:before.map(v=>({variantId:v.id,expectedRetailPriceCents:5744,retailPriceCents:target}))}));
 const races=await Promise.all(requests.map(request=>call('update_product_prices',request)));assert.equal(races.filter(r=>!r.isError).length,1);
 const raced=(await pool.query('SELECT "retailPriceCents" FROM "SpellmarkVariant" WHERE "productId"=$1',[productId])).rows;assert.equal(new Set(raced.map(v=>v.retailPriceCents)).size,1);
 console.log('Post-draft price MCP integration: authorization, intake lock, atomic prices, retries, concurrency and quote/mapping preservation passed.');
}finally{await pool.query('DELETE FROM "SpellmarkProduct" WHERE title=$1',[title]);await pool.end();}
