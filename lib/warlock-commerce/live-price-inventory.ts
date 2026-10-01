import { createHash } from "node:crypto";
import type { WarlockProductManifest } from "../warlock-mcp/manifest.ts";
import { etsySkuForVariant } from "./etsy-inventory.ts";
export type Json=Record<string,unknown>;
export function object(value:unknown):Json{if(!value || typeof value!=="object" || Array.isArray(value))throw Error("live_price_invalid_response");return value as Json;}
export function rows(value:unknown):Json[]{if(!Array.isArray(value))throw Error("live_price_invalid_response");return value.map(object);}
export function positiveId(value:unknown):string{if(!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value)))throw Error("live_price_identity_invalid");return String(value);}
export function priceCents(value:unknown):number{
 const p=object(value),a=p.amount,d=p.divisor;
 if(p.currency_code!=="USD" || typeof a!=="number" || !Number.isSafeInteger(a) || a<=0 || typeof d!=="number" || !Number.isSafeInteger(d) || d<=0 || !Number.isSafeInteger(a*100) || (a*100)%d!==0)throw Error("live_price_currency_or_amount_invalid");
 const cents=a*100/d;if(cents>2147483647)throw Error("live_price_currency_or_amount_invalid");return cents;
}
function ids(value:unknown){if(!Array.isArray(value) || value.some(v=>!Number.isSafeInteger(v)||v<=0))throw Error("live_price_inventory_properties_invalid");return value as number[];}
function stable(value:unknown):unknown{
 if(Array.isArray(value))return value.map(stable);
 if(value && typeof value==="object")return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,stable(v)]));return value;
}
export function fingerprint(value:unknown){return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");}
export function physicalPriceManifest(manifest:WarlockProductManifest){
 const listings=manifest.listings.filter(l=>l.fulfillment==="PHYSICAL"),variants=manifest.variants.filter(v=>v.fulfillment==="PHYSICAL");
 if(listings.length!==1 || !variants.length || variants.length>30 || !listings[0].etsyListingId)throw Error("live_price_physical_listing_required");
 positiveId(listings[0].etsyListingId);
 if(variants.some(v=>v.currency!=="USD" || !v.retailPriceCents || v.etsyListingId!==listings[0].etsyListingId || !v.etsyProductId || !v.printfulSyncVariantId || !v.printfulVariantId || !v.printfulStoreId) || !listings[0].printfulSyncProductId)throw Error("live_price_synced_mapping_required");
 return {...manifest,listings,variants};
}
/** Build the full current inventory body. Only caller-selected prices may be replaced. */
export function readLiveInventory(manifest:WarlockProductManifest,shopId:number,listing:Json,inventory:Json){
 const listingId=manifest.listings[0].etsyListingId!;
 if(positiveId(listing.listing_id)!==listingId || positiveId(listing.shop_id)!==String(shopId))throw Error("live_price_listing_ownership_mismatch");
 if(listing.state!=="active")throw Error("live_price_listing_not_active");
 const products=rows(inventory.products).filter(p=>p.is_deleted!==true);
 if(products.length!==manifest.variants.length)throw Error("live_price_variant_set_changed");
 const used=new Set<string>();
 const mapped=manifest.variants.map(variant=>{
  const sku=etsySkuForVariant(variant),matches=products.filter(p=>String(p.product_id)===variant.etsyProductId || p.sku===sku);
  if(matches.length!==1 || matches[0].sku!==sku || positiveId(matches[0].product_id)!==variant.etsyProductId || used.has(variant.etsyProductId!))throw Error("live_price_variant_identity_mismatch");
  used.add(variant.etsyProductId!);const remote=matches[0],offerings=rows(remote.offerings).filter(o=>o.is_deleted!==true);
  if(offerings.length!==1)throw Error("live_price_offering_ambiguous");
  const offer=offerings[0];positiveId(offer.offering_id);
  if(!Number.isSafeInteger(offer.quantity)||Number(offer.quantity)<0 || typeof offer.is_enabled!=="boolean")throw Error("live_price_offering_invalid");
  const price=priceCents(offer.price),readiness=Number(positiveId(offer.readiness_state_id));
  const properties=rows(remote.property_values).map(p=>{
   const propertyId=Number(positiveId(p.property_id));
   if(typeof p.property_name!=="string" || !Array.isArray(p.values) || p.values.some(v=>typeof v!=="string"))throw Error("live_price_inventory_properties_invalid");
   return {property_id:propertyId,property_name:p.property_name,scale_id:p.scale_id===null ? null : Number(positiveId(p.scale_id)),value_ids:ids(p.value_ids),values:p.values};
  });
  return {variantId:variant.id,etsyProductId:variant.etsyProductId!,etsySku:sku,priceCents:price,
   body:{sku,property_values:properties,offerings:[{quantity:offer.quantity as number,is_enabled:offer.is_enabled,price:price/100,readiness_state_id:readiness}]}};
 });
 const body={products:mapped.map(m=>m.body),price_on_property:ids(inventory.price_on_property ?? []),quantity_on_property:ids(inventory.quantity_on_property ?? []),sku_on_property:ids(inventory.sku_on_property ?? []),readiness_state_on_property:ids(inventory.readiness_state_on_property ?? [])};
 const identity=mapped.map(m=>[m.variantId,m.etsyProductId,m.etsySku]);
 return {mapped,body,identity,fingerprint:fingerprint({identity,body})};
}
