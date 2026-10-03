import test from 'node:test';
import assert from 'node:assert/strict';
import {etsyListingType} from '../lib/warlock-commerce/etsy-listing-type.ts';
import {assertEditableDraft} from '../lib/warlock-commerce/digital-delivery.ts';
test('Etsy response listing_type validates imported physical and digital drafts',()=>{
 for(const [fulfillment,listing_type] of [['PHYSICAL','physical'],['DIGITAL','download']]) {
 const listing={fulfillment,etsyListingId:'123',digitalDelivery:'INSTANT_DOWNLOAD'};
 assert.doesNotThrow(()=>assertEditableDraft(listing,{listing_id:123,shop_id:99,state:'draft',listing_type,when_made:'2020_2026'},99));
 assert.throws(()=>assertEditableDraft(listing,{listing_id:123,shop_id:99,state:'draft',listing_type:listing_type==='physical'?'download':'physical'},99),/type_mismatch/);
 }
});
test('ambiguous, absent, mixed and contradictory listing types fail closed',()=>{
 for(const remote of [{},{listing_type:null},{listing_type:'both'},{listing_type:'physical',type:'download'}])assert.throws(()=>etsyListingType(remote));
 assert.equal(etsyListingType({type:'physical'}),'physical');
 assert.equal(etsyListingType({listing_type:'physical',type:'physical'}),'physical');
});
