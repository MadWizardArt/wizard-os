import assert from 'node:assert/strict';
import pg from 'pg';
const base='http://127.0.0.1:3000',pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
const headers={'content-type':'application/json','accept':'application/json, text/event-stream','x-warlock-api-key':process.env.WARLOCK_API_KEY};
const title=`CI custom digital ledger ${Date.now()}`;
async function call(name,args,authenticated=true){const h={...headers};if(!authenticated)delete h['x-warlock-api-key'];const response=await fetch(base+'/api/warlock/mcp',{method:'POST',headers:h,body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})});if(!authenticated){assert.equal(response.status,401);return;}assert.equal(response.status,200);const text=await response.text(),line=text.split('\n').find(l=>l.startsWith('data: '));return JSON.parse(line?line.slice(6):text).result;}
try {
 const intake=await call('intake_product',{confirmIntake:true,product:{title},variants:[{fulfillment:'DIGITAL',label:'Custom portrait',retailPriceCents:2495}],listing:{fulfillment:'DIGITAL',digitalDelivery:'MADE_TO_ORDER'}});
 assert.equal(intake.isError,undefined,intake.content[0].text);const productId=intake.structuredContent.productId;
 const listing=(await pool.query('SELECT * FROM "SpellmarkListing" WHERE "productId"=$1',[productId])).rows[0];assert.equal(listing.digitalDelivery,'MADE_TO_ORDER');assert.equal(listing.whenMade,'made_to_order');
 const note={productId,requestId:'ci-note-retry-1',note:'Customer sends reference after purchase. Deliver custom files after approval.',confirmRecord:true};
 await call('record_product_note',note,false);
 assert.equal((await call('record_product_note',{...note,confirmRecord:false})).isError,true);
 const events=await Promise.all([call('record_product_note',note),call('record_product_note',note)]);assert.ok(events.every(e=>e.structuredContent.state==='NOTE_RECORDED'));assert.equal(events[0].structuredContent.eventId,events[1].structuredContent.eventId);
 assert.equal((await call('record_product_note',{...note,note:'Different content'})).isError,true);
 assert.equal((await call('record_product_note',{...note,productId:'nonexistent'})).isError,true);
 assert.equal((await pool.query('SELECT count(*) FROM "SpellmarkJournal" WHERE "productId"=$1',[productId])).rows[0].count,'1');
 const ledger=(await call('get_product_bookkeeping',{productId})).structuredContent;assert.equal(ledger.history[0].body.note,note.note);assert.equal(ledger.listings[0].observation,null);assert.equal(ledger.listings[0].verificationCurrent,false);
 const catalog=(await call('get_product_bookkeeping',{limit:50})).structuredContent;assert.ok(catalog.products.some(p=>p.id===productId));
 const wrong=await call('reconcile_etsy_listing',{productId,fulfillment:'DIGITAL',expectedEtsyListingId:'999',confirmReconciliation:true});assert.equal(wrong.isError,true);assert.match(wrong.content[0].text,/identity_changed/);
 const linkPreview={productId:'nonexistent',fulfillment:'DIGITAL',expectedEtsyListingId:null,targetEtsyListingId:'20'};
 await call('preview_etsy_listing_link',linkPreview,false);
 const missingLinkProduct=await call('preview_etsy_listing_link',linkPreview);assert.equal(missingLinkProduct.isError,true);assert.match(missingLinkProduct.content[0].text,/etsy_link_product_missing/);
 const linkApply={productId,previewId:'missing',confirmListingLink:false};
 await call('apply_etsy_listing_link',linkApply,false);
 assert.equal((await call('apply_etsy_listing_link',linkApply)).isError,true);
 const still=(await pool.query('SELECT * FROM "SpellmarkListing" WHERE id=$1',[listing.id])).rows[0];assert.deepEqual(still,listing);
 assert.equal((await fetch(base+`/api/warlock/products/${productId}/bookkeeping`)).status,401);
 console.log('Custom digital and bookkeeping MCP integration: persisted modes, auth, confirmations, concurrent retry notes, conflict rejection, ledger read and unchanged listing identities passed.');
}finally{await pool.query('DELETE FROM "SpellmarkProduct" WHERE title=$1',[title]);await pool.end();}
