import test from 'node:test';
import assert from 'node:assert/strict';
import {etsyWriteError,etsyFailureDetails,EtsyWriteError} from '../lib/warlock-commerce/etsy-write-error.ts';
test('Etsy 400 returns the exact bounded rejection text and operation',async()=>{
 const e=await etsyWriteError(Response.json({error:'Invalid value for products[0].property_values.'},{status:400}),'inventory');
 assert.equal(e.message,'etsy_http_400');assert.deepEqual(etsyFailureDetails(e),{status:400,operation:'inventory',messages:['Invalid value for products[0].property_values.'],responseReceived:true});
});
test('diagnostics redact supplied credentials, URLs, bearer and credential fields',async()=>{
 const e=await etsyWriteError(Response.json({errors:[{field:'products',message:'Invalid value: short-token short-app-key short-shared-secret at https://private.example/asset?secret=x Bearer abc123 access_token=foobar'}],access_token:'not-a-public-error',request:{description:'do not expose'}},{status:422}),'inventory',['short-token','short-app-key:short-shared-secret']);
 const r=JSON.stringify(etsyFailureDetails(e));for(const secret of ['short-token','short-app-key','short-shared-secret','private.example','abc123','foobar','not-a-public-error','do not expose'])assert.ok(!r.includes(secret));assert.ok(r.includes('Invalid value'));
});
test('oversized, HTML and malformed bodies do not escape into diagnostics',async()=>{
 for(const body of ['<html>private data</html>','not JSON',JSON.stringify({error:'x'.repeat(10000)})]){const e=await etsyWriteError(new Response(body,{status:500}),'description');assert.deepEqual(e.details,[]);assert.equal(e.status,500);}
});
test('public message count and length are bounded; network errors stay uncertain',async()=>{
 const e=await etsyWriteError(Response.json({errors:Array.from({length:12},(_,i)=>'Error '+i+' '+'a '.repeat(500))},{status:400}),'inventory');assert.ok(e.details.length<=6);assert.ok(e.details.every(v=>v.length<=700));assert.equal(etsyFailureDetails(new Error('timeout')),undefined);assert.ok(e instanceof EtsyWriteError);
});
