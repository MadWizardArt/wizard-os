import * as z from "zod/v4";
import type { WarlockProductManifest } from "../warlock-mcp/manifest.ts";
import { fingerprint, physicalPriceManifest, readLiveInventory, object, rows, positiveId, type Json } from "./live-price-inventory.ts";
import { etsySkuForVariant } from "./etsy-inventory.ts";
import { ensureEtsyAiDisclosure } from "./policy.ts";
import { etsyListingType } from "./etsy-listing-type.ts";
import { quotePrintfulVariant, record, type Get } from "./printful-catalog.ts";
import type { SupplierPreflight } from "./printful-preflight.ts";
import { withLivePrintfulQuotes } from "./live-quotes.ts";
import { evaluateCommerceGates } from "./gates.ts";

const id=z.string().min(1).max(100),positive=z.number().int().positive().max(2147483647);
const etsyInteger=z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const property=z.strictObject({property_id:etsyInteger,property_name:z.string().min(1).max(100),scale_id:etsyInteger.nullable(),value_ids:z.array(etsyInteger).max(1),values:z.array(z.string().min(1).max(100)).length(1)});
export const garmentPreviewShape={productId:id,description:z.string().trim().min(1).max(11800),targets:z.array(z.strictObject({
 sourceVariantId:id,variantId:id.optional().describe("Same as sourceVariantId to retain an existing edition; omit to add a new color/size copied from that source."),
 catalogProductId:positive,catalogVariantId:positive,color:z.string().min(1).max(100),size:z.string().min(1).max(40),
 propertyValues:z.array(property).min(1).max(3).optional().describe("For listings using separate Color/Size properties, provide the inspected property IDs with target values. Single custom Edition listings derive Color / Size automatically.")
})).min(1).max(30)};
export const garmentPreviewSchema=z.strictObject(garmentPreviewShape);
export const garmentApplyShape={productId:id,previewId:id,confirmMigration:z.literal(true),confirmTemporaryUnavailability:z.literal(true)};
export const garmentEnableShape={productId:id,previewId:id,expectedInventoryFingerprint:z.string().regex(/^[a-f0-9]{64}$/),confirmVisualReview:z.literal(true),confirmAvailability:z.literal(true)};
export type MigrationRead=(path:string)=>Promise<Json>;
export function migrationCanonical(m:WarlockProductManifest){return fingerprint({id:m.id,listings:m.listings,variants:m.variants});}
export function protectedListing(remote:Json){return Object.fromEntries(["listing_id","shop_id","state","listing_type","type","title","tags","taxonomy_id","shipping_profile_id","return_policy_id","who_made","when_made","is_supply"].map(k=>[k,remote[k]??null]));}
export function migrationPhysical(m:WarlockProductManifest){
 const physical=physicalPriceManifest(m);
 if(new Set(physical.variants.map(v=>v.printfulStoreId)).size!==1)throw Error("garment_migration_store_ambiguous");
 return physical;
}
export async function inspectMigration(m:WarlockProductManifest,shopId:number,read:MigrationRead){
 const listings=m.listings.filter(l=>l.fulfillment==="PHYSICAL");if(listings.length!==1||!listings[0].etsyListingId)throw Error("garment_migration_listing_missing");
 const physical={...m,listings,variants:m.variants.filter(v=>v.fulfillment==="PHYSICAL")};
 const listing=await read("/listings/"+listings[0].etsyListingId);
 if(etsyListingType(listing)!=="physical")throw Error("garment_migration_physical_required");
 const inventory=await read("/listings/"+listings[0].etsyListingId+"/inventory?legacy=false");
 return {manifest:physical,listing,inventory:readLiveInventory(physical,shopId,listing,inventory)};
}
export async function buildGarmentPreview(m:WarlockProductManifest,raw:unknown,shopId:number,read:MigrationRead,get:Get,operationId:string){
 const input=garmentPreviewSchema.parse(raw);if(input.productId!==m.id)throw Error("garment_migration_product_mismatch");
 const physical=migrationPhysical(m),before=await inspectMigration(physical,shopId,read);
 const retained=input.targets.filter(t=>t.variantId).map(t=>t.variantId!);
 if(new Set(retained).size!==retained.length||retained.length!==physical.variants.length||physical.variants.some(v=>!retained.includes(v.id)))throw Error("garment_migration_existing_variant_set_required");
 if(new Set(input.targets.map(t=>t.catalogProductId)).size!==1||new Set(input.targets.map(t=>t.catalogVariantId)).size!==input.targets.length)throw Error("garment_migration_target_catalog_ambiguous");
 const storeId=physical.variants[0].printfulStoreId!;
 const targets=await migrationMap(input.targets,async(t,index)=>{
  const source=physical.variants.find(v=>v.id===t.sourceVariantId);
  if(!source||t.variantId&&t.variantId!==source.id)throw Error("garment_migration_source_not_owned");
  const current=before.inventory.mapped.find(v=>v.variantId===source.id)!;
  if(current.priceCents!==source.retailPriceCents||!current.body.offerings[0].is_enabled)throw Error("garment_migration_source_price_or_availability_drift");
  const detail=record((await get("/products/variant/"+t.catalogVariantId,storeId)).result),catalog=record(detail.variant);
  if(Number(catalog.id)!==t.catalogVariantId||Number(catalog.product_id)!==t.catalogProductId||String(catalog.color)!==t.color||String(catalog.size)!==t.size)throw Error("garment_migration_catalog_selection_mismatch");
  const quote=await quotePrintfulVariant({productId:t.catalogProductId,catalogVariantId:t.catalogVariantId,storeId},get);
  if(quote.availability!=="in_stock")throw Error("garment_migration_target_unavailable");
  const label=t.color+" / "+t.size;
  const variantId=t.variantId??"gm-"+operationId+"-"+index;
  const sku=t.variantId?etsySkuForVariant(source):"GM-"+operationId.slice(0,20)+"-"+index;
  const template=current.body.property_values;
  const properties=t.propertyValues??(template.length===1&&template[0].property_id===513?[{...template[0],value_ids:[],values:[label]}]:null);
  if(!properties||properties.length!==template.length||properties.some(p=>!template.some(old=>old.property_id===p.property_id&&old.property_name===p.property_name&&old.scale_id===p.scale_id))||new Set(properties.map(p=>p.property_id)).size!==properties.length)throw Error("garment_migration_property_plan_required");
  if(t.propertyValues&&!([t.color,t.size].every(value=>properties.some(p=>p.values.includes(value)))||properties.some(p=>p.values.includes(label))))throw Error("garment_migration_property_catalog_mismatch");
  const body={...structuredClone(current.body),sku,property_values:properties,offerings:[{...current.body.offerings[0],is_enabled:false}]};
  return {variantId,sourceVariantId:source.id,isNew:!t.variantId,label,sku,color:t.color,size:t.size,catalogProductId:t.catalogProductId,catalogVariantId:t.catalogVariantId,storeId,retailPriceCents:source.retailPriceCents!,quote,body};
 });
 if(new Set(targets.map(t=>t.label)).size!==targets.length||new Set(targets.map(t=>t.sku)).size!==targets.length)throw Error("garment_migration_duplicate_edition");
 const desired={...before.inventory.body,products:targets.map(t=>t.body)};
 for(const key of ["price_on_property","quantity_on_property","readiness_state_on_property"] as const){
  const groups=new Map<string,unknown>();
  for(const p of desired.products){const combination=fingerprint(p.property_values.filter(v=>desired[key].includes(v.property_id)).map(v=>[v.property_id,v.values]));const value=key==="price_on_property"?p.offerings[0].price:key==="quantity_on_property"?p.offerings[0].quantity:p.offerings[0].readiness_state_id;if(groups.has(combination)&&groups.get(combination)!==value)throw Error("garment_migration_property_group_conflict");groups.set(combination,value);}
 }
 const skuGroups=new Set(desired.products.map(p=>fingerprint(p.property_values.filter(v=>desired.sku_on_property.includes(v.property_id)).map(v=>[v.property_id,v.values]))));
 if(skuGroups.size!==targets.length)throw Error("garment_migration_sku_properties_ambiguous");
 const description=ensureEtsyAiDisclosure(input.description);if(description.length>11800)throw Error("garment_migration_description_too_long");
 const proposed={...physical,variants:targets.map(t=>({...physical.variants.find(v=>v.id===t.sourceVariantId)!,id:t.variantId,label:t.label,printfulProductId:t.catalogProductId,printfulVariantId:t.catalogVariantId,productionBaseCents:t.quote.productionBaseCents,productionQuotedAt:t.quote.quotedAt}))};
 if(!evaluateCommerceGates(proposed).margin.pass)throw Error("garment_migration_base_margin_below_floor");
 return {schemaVersion:1,productId:m.id,etsyListingId:physical.listings[0].etsyListingId!,listingId:physical.listings[0].id,shopId,storeId,
  canonicalFingerprint:migrationCanonical(m),beforeInventoryFingerprint:before.inventory.fingerprint,beforeBody:before.inventory.body,
  beforeDescription:String(before.listing.description??""),protectedListing:protectedListing(before.listing),description,targets,desired,
  expiresAt:new Date(Date.now()+15*60000).toISOString(),state:"GARMENT_MIGRATION_PREVIEW",supplierMutated:false,
  nextAction:"Review the target blank, colors, sizes, preserved prices, quantities, description and temporarily disabled editions. Apply this saved preview only with confirmation of temporary unavailability. Then wait for Etsy-to-Printful import, create and approve new placement previews, visually check mockups, and enable_migrated_garment after combined quotes pass. Base quotes here exclude additional placements."};
}
export type GarmentPreview=Awaited<ReturnType<typeof buildGarmentPreview>>;
function semanticBody(body:GarmentPreview["desired"]){return {...body,products:body.products.map(p=>({...p,property_values:p.property_values.map(({value_ids:_,...v})=>v)}))};}
export async function readMigrationTarget(preview:GarmentPreview,read:MigrationRead,enabled=false){
 const listing=await read("/listings/"+preview.etsyListingId);
 if(fingerprint(protectedListing(listing))!==fingerprint(preview.protectedListing))throw Error("garment_migration_listing_changed");
 const raw=await read("/listings/"+preview.etsyListingId+"/inventory?legacy=false");
 const products=rows(raw.products).filter(p=>p.is_deleted!==true);
 if(products.length!==preview.targets.length)throw Error("garment_migration_target_not_saved");
 const mapped=preview.targets.map(t=>{
  const matches=products.filter(p=>p.sku===t.sku);if(matches.length!==1)throw Error("garment_migration_target_not_saved");
  return {...t,id:t.variantId,fulfillment:"PHYSICAL" as const,etsySku:t.sku,etsyProductId:positiveId(matches[0].product_id),etsyListingId:preview.etsyListingId,currency:"USD"};
 });
 const synthetic={id:preview.productId,listings:[{etsyListingId:preview.etsyListingId}],variants:mapped} as unknown as WarlockProductManifest;
 const observed=readLiveInventory(synthetic,preview.shopId,listing,raw);
 const expected=structuredClone(preview.desired);expected.products.forEach(p=>p.offerings[0].is_enabled=enabled);
 if(fingerprint(semanticBody(observed.body))!==fingerprint(semanticBody(expected)))throw Error("garment_migration_target_not_saved");
 return {listing,observed,mapped};
}
export type MigrationDependencies={read:MigrationRead;writeInventory:(id:string,body:Json)=>Promise<unknown>;writeDescription:(id:string,description:string)=>Promise<unknown>;recordIntent:()=>Promise<void>;save:(mapped:Awaited<ReturnType<typeof readMigrationTarget>>["mapped"])=>Promise<void>};
export async function applyGarmentPreview(m:WarlockProductManifest,p:GarmentPreview,deps:MigrationDependencies,recovery=false){
 if(p.productId!==m.id||p.canonicalFingerprint!==migrationCanonical(m))throw Error("garment_migration_canonical_changed");
 if(!recovery&&Date.parse(p.expiresAt)<Date.now())throw Error("garment_migration_preview_expired");
 const listing=await deps.read("/listings/"+p.etsyListingId);
 if(fingerprint(protectedListing(listing))!==fingerprint(p.protectedListing))throw Error("garment_migration_listing_changed");
 let target:Awaited<ReturnType<typeof readMigrationTarget>>|undefined;
 try{target=await readMigrationTarget(p,deps.read);}catch{ /* Only an unchanged source inventory may be written below. */ }
 if(!target&&(await inspectMigration(m,p.shopId,deps.read)).inventory.fingerprint!==p.beforeInventoryFingerprint)throw Error("garment_migration_inventory_changed");
 if(String(listing.description??"")!==p.beforeDescription&&String(listing.description??"")!==p.description)throw Error("garment_migration_description_changed");
 // Recovery never replays an uncertain inventory write. It only verifies saved target inventory.
 if(recovery&&!target)throw Error("garment_migration_uncertain_inventory_inspect_required");
 await deps.recordIntent();
 if(!target){
  const rechecked=await inspectMigration(m,p.shopId,deps.read);
  if(rechecked.inventory.fingerprint!==p.beforeInventoryFingerprint||fingerprint(protectedListing(rechecked.listing))!==fingerprint(p.protectedListing)||String(rechecked.listing.description??"")!==p.beforeDescription)throw Error("garment_migration_inventory_changed");
  await deps.writeInventory(p.etsyListingId,p.desired);target=await readMigrationTarget(p,deps.read);}
 if(String(target.listing.description??"")!==p.beforeDescription&&String(target.listing.description??"")!==p.description)throw Error("garment_migration_description_changed");
 if(String(target.listing.description??"")!==p.description){await deps.writeDescription(p.etsyListingId,p.description);target=await readMigrationTarget(p,deps.read);}
 if(String(target.listing.description??"")!==p.description)throw Error("garment_migration_description_readback_failed");
 await deps.save(target.mapped);
 return {productId:p.productId,state:"GARMENT_MIGRATION_STAGED",inventoryFingerprint:target.observed.fingerprint,editionsAvailable:false,
  targets:p.targets.map(t=>({variantId:t.variantId,label:t.label,catalogProductId:t.catalogProductId,catalogVariantId:t.catalogVariantId})),
  nextAction:"Etsy inventory and description are verified; editions are disabled. New blank mappings are canonical but supplier production has not changed. Use check_printful_import, then saved placement previews for all sizes/colors. Approve placements and visually inspect revised mockups before enable_migrated_garment."};
}
export function safeMigrationError(error:unknown){const code=error instanceof Error?error.message:"";return /^(garment_migration_[a-z_]+|etsy_http_\d{3}|printful_[a-z0-9_]+|live_price_[a-z_]+|warlock_commerce_writes_disabled|supplier_preflight_failed|live_production_quote_[a-z_]+)$/.test(code)?code:"garment_migration_failed";}

export function validateMigrationAvailability(m:WarlockProductManifest,p:GarmentPreview,evidence:Json|null,supplier:SupplierPreflight){
 const physical=m.variants.filter(v=>v.fulfillment==="PHYSICAL");
 if(physical.length!==p.targets.length||p.targets.some(t=>!physical.some(v=>v.id===t.variantId&&v.label===t.label&&v.printfulProductId===t.catalogProductId&&v.printfulVariantId===t.catalogVariantId&&v.printfulStoreId===p.storeId&&v.etsySku===t.sku&&v.etsyListingId===p.etsyListingId&&v.retailPriceCents===t.retailPriceCents)))throw Error("garment_migration_canonical_changed");
 if(evidence?.state!=="PLACEMENT_FILES_VERIFIED"||!Array.isArray(evidence.verifiedVariantIds)||p.targets.some(t=>!(evidence.verifiedVariantIds as string[]).includes(t.variantId)))throw Error("garment_migration_placement_verification_required");
 if(!supplier.pass||supplier.variants.length!==physical.length||supplier.variants.some(v=>v.quote?.configurationKind!=="CONFIGURED_SYNC")||physical.some(v=>!v.printfulSyncVariantId||!v.productionQuoteJson||JSON.parse(v.productionQuoteJson).configurationKind!=="CONFIGURED_SYNC"))throw Error("garment_migration_supplier_not_verified");
 const fresh=withLivePrintfulQuotes(m,supplier);
 if(!evaluateCommerceGates(fresh).margin.pass)throw Error("garment_migration_combined_margin_below_floor");
 return fresh;
}

export async function migrationMap<T,R>(values:T[],fn:(value:T,index:number)=>Promise<R>):Promise<R[]>{
 const results:R[]=new Array(values.length);let next=0;
 await Promise.all(Array.from({length:Math.min(4,values.length)},async()=>{while(next<values.length){const index=next++;results[index]=await fn(values[index],index);}}));
 return results;
}
