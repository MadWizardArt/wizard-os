import type { WarlockProductManifest } from "../warlock-mcp/manifest.ts";
import type { SupplierPreflight } from "./printful-preflight.ts";
import type { SyncRequest } from "./printful-import.ts";
import { etsySkuForVariant } from "./etsy-inventory.ts";
import { cents } from "./printful-catalog.ts";
import { readSyncConfiguration } from "./printful-sync-configuration.ts";
import { evaluateCommerceGates } from "./gates.ts";
import { withLivePrintfulQuotes } from "./live-quotes.ts";
import { livePriceUpdateSchema } from "./live-price-schema.ts";
import { object, positiveId, physicalPriceManifest, readLiveInventory, fingerprint, type Json } from "./live-price-inventory.ts";

export type LivePriceDependencies={
 load:()=>Promise<WarlockProductManifest | null>;
 etsyRead:(path:string)=>Promise<Json>;
 etsyWrite:(listingId:string,body:Json)=>Promise<unknown>;
 printful:SyncRequest;
 supplier:(manifest:WarlockProductManifest)=>Promise<SupplierPreflight>;
};
function canonicalSignature(m:WarlockProductManifest){return fingerprint({id:m.id,listings:m.listings,variants:m.variants});}
async function live(deps:LivePriceDependencies,shopId:number){
 const loaded=await deps.load();if(!loaded)throw Error("live_price_product_not_found");
 const manifest=physicalPriceManifest(loaded),id=manifest.listings[0].etsyListingId!;
 const listing=await deps.etsyRead("/listings/"+id),inventory=await deps.etsyRead("/listings/"+id+"/inventory?legacy=false");
 return {manifest,listingId:id,inventory:readLiveInventory(manifest,shopId,listing,inventory)};
}
async function supplierRetail(deps:LivePriceDependencies,manifest:WarlockProductManifest,variantId:string){
 const v=manifest.variants.find(v=>v.id===variantId)!;
 const payload=await deps.printful("/sync/variant/"+v.printfulSyncVariantId,v.printfulStoreId!);
 const configuration=readSyncConfiguration(payload,v.printfulSyncVariantId!,v.printfulVariantId!,manifest.listings[0].printfulSyncProductId!);
 if(!configuration.configured)throw Error("live_price_printful_configuration_incomplete");
 const result=object(object(payload).result),sync=object(result.sync_variant),product=object(result.sync_product);
 if(positiveId(product.id)!==String(manifest.listings[0].printfulSyncProductId) || String(product.external_id)!==manifest.listings[0].etsyListingId || (sync.external_id!==undefined && String(sync.external_id)!==v.etsyProductId) || (sync.sku!=null && sync.sku!==etsySkuForVariant(v)))throw Error("live_price_printful_identity_mismatch");
 if(sync.currency!=="USD")throw Error("live_price_printful_currency_not_usd");
 return {retailPriceCents:sync.retail_price===null ? null : cents(sync.retail_price),configurationFingerprint:configuration.fingerprint};
}
export async function inspectLiveVariantPrices(productId:string,shopId:number,deps:LivePriceDependencies){
 const {manifest,listingId,inventory}=await live(deps,shopId);
 if(manifest.id!==productId)throw Error("live_price_product_identity_mismatch");
 const variants=new Array<Record<string,unknown>>(manifest.variants.length);let next=0;
 await Promise.all(Array.from({length:Math.min(4,variants.length)},async()=>{
  while(next<variants.length){const i=next++,v=manifest.variants[i],remote=inventory.mapped.find(m=>m.variantId===v.id)!,pf=await supplierRetail(deps,manifest,v.id);
   variants[i]={variantId:v.id,label:v.label,etsyProductId:remote.etsyProductId,etsySku:remote.etsySku,canonicalRetailPriceCents:v.retailPriceCents,etsyPriceCents:remote.priceCents,printfulRetailPriceCents:pf.retailPriceCents,currency:"USD"};}
 }));
 return {productId,etsyListingId:listingId,state:"LIVE_PRICES_INSPECTED",checkedAt:new Date().toISOString(),inventoryFingerprint:inventory.fingerprint,variants,
  nextAction:"Select approved editions, save their canonical targets using update_product_prices if needed, then update_etsy_variant_prices with this inventory fingerprint, expected Etsy/Printful prices, the canonical target cents and confirmLivePriceWrite:true. Etsy is the storefront price; Printful receives an explicit retail-only mirror."};
}
export function safeLivePriceError(error:unknown){
 const code=error instanceof Error ? error.message : "";
 return /^(?:live_price_[a-z0-9_]+|etsy_http_\d{3}|printful_[a-z0-9_]+|supplier_preflight_failed|live_production_quote_(missing_or_mismatched|expired)|warlock_commerce_writes_disabled|warlock_shop_id_missing|etsy_not_connected|etsy_shop_not_allowed)$/.test(code)?code:"live_price_request_failed";
}
/** Re-read -> price-only inventory update -> Etsy verification -> retail-only Printful mirror. */
export async function updateLiveVariantPrices(raw:unknown,shopId:number,deps:LivePriceDependencies){
 const input=livePriceUpdateSchema.parse(raw);
 if(new Set(input.prices.map(p=>p.variantId)).size!==input.prices.length)throw Error("live_price_duplicate_variant");
 let stage="INSPECT",etsyWriteAttempted=false,etsyPricesVerified=false;
 const printfulWriteAttemptedVariantIds:string[]=[],printfulVerifiedVariantIds:string[]=[];
 const deadline=Date.now()+145000;
 const budget=()=>{if(Date.now()>deadline-25000)throw Error("live_price_time_budget_retry");};
 try{
  const first=await live(deps,shopId),{manifest,listingId}=first;
  if(manifest.id!==input.productId)throw Error("live_price_product_identity_mismatch");
  const signature=canonicalSignature(manifest);
  for(const change of input.prices){
   const v=manifest.variants.find(v=>v.id===change.variantId);
   if(!v || v.retailPriceCents!==change.retailPriceCents)throw Error("live_price_target_not_canonical");
   const remote=first.inventory.mapped.find(m=>m.variantId===v.id)!;
   if(!remote.body.offerings[0].is_enabled)throw Error("live_price_selected_offering_disabled");
   if(remote.priceCents!==change.expectedEtsyPriceCents && remote.priceCents!==change.retailPriceCents)throw Error("live_price_expected_etsy_price_changed");
  }
  const complete=first.inventory.mapped.every(m=>!input.prices.some(p=>p.variantId===m.variantId && p.retailPriceCents!==m.priceCents));
  if(!complete && first.inventory.fingerprint!==input.expectedInventoryFingerprint)throw Error("live_price_inventory_changed_reinspect");
  stage="SUPPLIER_PREFLIGHT";
  const supplier=await deps.supplier(manifest),fresh=withLivePrintfulQuotes(manifest,supplier);
  const selected={...fresh,variants:fresh.variants.filter(v=>input.prices.some(p=>p.variantId===v.id))};
  if(!evaluateCommerceGates(selected).margin.pass)throw Error("live_price_margin_below_floor");
  const configurations=new Map<string,string>();
  for(const change of input.prices){
   budget();const pf=await supplierRetail(deps,manifest,change.variantId);
   if(pf.retailPriceCents!==change.expectedPrintfulRetailPriceCents && pf.retailPriceCents!==change.retailPriceCents)throw Error("live_price_expected_printful_price_changed");
   const quote=supplier.variants.find(v=>v.variantId===change.variantId)?.quote;
   if(quote?.configurationKind!=="CONFIGURED_SYNC" || quote.configurationFingerprint!==pf.configurationFingerprint)throw Error("live_price_printful_configuration_changed");
   configurations.set(change.variantId,pf.configurationFingerprint);
  }
  stage="RECHECK";budget();
  const current=await live(deps,shopId);
  if(canonicalSignature(current.manifest)!==signature || current.inventory.fingerprint!==first.inventory.fingerprint)throw Error("live_price_inventory_or_canonical_changed");
  withLivePrintfulQuotes(manifest,supplier);
  const desired=structuredClone(current.inventory.body);
  current.inventory.mapped.forEach((m,i)=>{const change=input.prices.find(p=>p.variantId===m.variantId);if(change)desired.products[i].offerings[0].price=change.retailPriceCents/100;});
  // Etsy requires prices sharing the same price-property combination to agree.
  const groups=new Map<string,number>();
  for(const p of desired.products){
   const key=fingerprint(p.property_values.filter(v=>desired.price_on_property.includes(v.property_id)));
   const price=p.offerings[0].price;if(groups.has(key)&&groups.get(key)!==price)throw Error("live_price_shared_price_property_conflict");groups.set(key,price);
  }
  if(!complete){stage="WRITE_ETSY_PRICES";budget();etsyWriteAttempted=true;await deps.etsyWrite(listingId,desired);}
  stage="VERIFY_ETSY_PRICES";
  const verified=await live(deps,shopId);
  const desiredFingerprint=fingerprint({identity:current.inventory.identity,body:desired});
  if(canonicalSignature(verified.manifest)!==signature || verified.inventory.fingerprint!==desiredFingerprint)throw Error("live_price_etsy_verification_failed");
  etsyPricesVerified=true;
  for(const change of input.prices){
   stage="MIRROR_PRINTFUL_RETAIL";budget();
   const v=manifest.variants.find(v=>v.id===change.variantId)!,pf=await supplierRetail(deps,manifest,change.variantId);
   if(pf.configurationFingerprint!==configurations.get(v.id))throw Error("live_price_printful_configuration_changed");
   if(pf.retailPriceCents!==change.retailPriceCents){
    if(pf.retailPriceCents!==change.expectedPrintfulRetailPriceCents)throw Error("live_price_expected_printful_price_changed");
    printfulWriteAttemptedVariantIds.push(v.id);
    await deps.printful("/sync/variant/"+v.printfulSyncVariantId,v.printfulStoreId!,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({retail_price:(change.retailPriceCents/100).toFixed(2)})});
   }
   stage="VERIFY_PRINTFUL_RETAIL";
   const after=await supplierRetail(deps,manifest,v.id);
   if(after.retailPriceCents!==change.retailPriceCents || after.configurationFingerprint!==configurations.get(v.id))throw Error("live_price_printful_verification_failed");
   printfulVerifiedVariantIds.push(v.id);
  }
  stage="FINAL_VERIFY";
  const final=await live(deps,shopId);
  if(canonicalSignature(final.manifest)!==signature || final.inventory.fingerprint!==desiredFingerprint)throw Error("live_price_etsy_verification_failed");
  return {productId:input.productId,etsyListingId:listingId,state:"LIVE_PRICES_VERIFIED",checkedAt:new Date().toISOString(),etsyWriteAttempted,etsyPricesVerified,printfulWriteAttemptedVariantIds,printfulVerifiedVariantIds,
   prices:input.prices.map(p=>({variantId:p.variantId,retailPriceCents:p.retailPriceCents,currency:"USD"})),nextAction:"Selected Etsy and Printful retail prices match the canonical targets. Review the live listing. Publication, files, mappings and order handling remain under the existing workflow."};
 }catch(error){return {productId:input.productId,state:etsyWriteAttempted || etsyPricesVerified || printfulWriteAttemptedVariantIds.length ? "VERIFY_OR_RETRY_REQUIRED" : "BLOCKED",
   checkedAt:new Date().toISOString(),stage,errorCode:safeLivePriceError(error),etsyWriteAttempted,etsyPricesVerified:stage==="FINAL_VERIFY"?false:etsyPricesVerified,printfulWriteAttemptedVariantIds,printfulVerifiedVariantIds,
   nextAction:"Inspect live prices before retrying. External changes may have partially completed; no rollback, re-draft or publication is attempted. Retry the same approved targets with current expected prices and inventory fingerprint."};}
}
