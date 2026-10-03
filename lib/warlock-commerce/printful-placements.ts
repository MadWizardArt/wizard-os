import { createHash } from "node:crypto";
import * as z from "zod/v4";
import type { WarlockProductManifest, WarlockManifestAsset } from "../warlock-mcp/manifest.ts";
import { inspectPrintfulImport, type SyncRequest } from "./printful-import.ts";
import { quotePrintfulVariant, type Get, type PrintfulQuote, record, rows } from "./printful-catalog.ts";
import { etsyListingType } from "./etsy-listing-type.ts";
import { PrintfulSyncConfigurationError, syncConfigurationIssues } from "./printful-sync-configuration.ts";
import { readProcessedConfiguration } from "./printful-readback.ts";

const integer = z.number().int().min(1).max(10000).describe("Integer pixels at 300 DPI, not inches. Use the approved catalog print area.");
export const positionSchema = z.strictObject({ area_width: integer, area_height: integer, width: integer, height: integer,
  top: z.number().int().min(0).max(30000).describe("Top offset in pixels; zero is allowed."), left: z.number().int().min(0).max(30000).describe("Left offset in pixels; zero is allowed."), limit_to_print_area: z.literal(true).default(true) });
export const placementShape = { productId: z.string().min(1).max(100).describe("Canonical Warlock product ID from get_product."), variants: z.array(z.strictObject({
  variantId: z.string().min(1).max(100).describe("Canonical Warlock variant ID, not size label or Printful catalog ID."), files: z.array(z.strictObject({ assetId: z.string().min(1).max(100).describe("Existing approved Warlock master asset ID. No reupload required."),
    type: z.enum(["default", "front", "back", "sleeve_left", "sleeve_right"]).describe("Printful placement identifier; right sleeve is sleeve_right, left sleeve is sleeve_left."), position: positionSchema })).min(1).max(4),
})).min(1).max(30) };
export type PreparedCanvas = { asset:WarlockManifestAsset; md5:string; width:number; height:number; dpi:number };
export function placementFingerprint(value: unknown): string {
  const stable = (v: unknown): unknown => Array.isArray(v) ? v.map(stable) : v && typeof v === "object"
    ? v instanceof Date ? v.toISOString() : Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,stable(v)])) : v;
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}
function canonicalPlacementFingerprint(manifest:WarlockProductManifest) {
  return placementFingerprint({...manifest,assets:manifest.assets.filter(a=>a.role!=="production_canvas")});
}
export function remotePlacementSnapshot(payload: unknown, syncId: number, productId: number) {
  const remote=record(record(record(payload).result).sync_variant);
  if(Number(remote.id)!==syncId || Number(remote.sync_product_id)!==productId || !Array.isArray(remote.files)) throw Error("printful_sync_identity_mismatch");
  return { id:syncId, variant_id:remote.variant_id ?? null, synced:remote.synced, is_ignored:remote.is_ignored ?? false,
    options:remote.options ?? [], files:rows(remote.files).filter(f=>f.type!=="preview").map(f=>({ id:f.id,type:f.type,status:f.status,hash:f.hash ?? null,width:f.width ?? null,height:f.height ?? null,dpi:f.dpi ?? null,options:f.options ?? [] })).sort((a,b)=>String(a.type).localeCompare(String(b.type))) };
}
export function verifyPlacementReadback(payload: unknown, syncId: number, productId: number, catalogId: number,
  expected: Array<{ type:string; canvas:PreparedCanvas }>) {
  const remote=record(record(record(payload).result).sync_variant);
  remotePlacementSnapshot(payload,syncId,productId);
  const files=rows(remote.files).filter(f=>f.type!=="preview");
  const issues=syncConfigurationIssues(remote,catalogId);
  if (files.length===expected.length && issues.length && issues.every(i=>["not_synced","processing"].includes(i.reason)) && issues.some(i=>i.reason==="processing") && expected.every(want=>files.some(file=>file.type===want.type))) {
    throw new PrintfulSyncConfigurationError("printful_file_processing_pending",issues);
  }
  if(remote.synced!==true || remote.is_ignored===true || Number(remote.variant_id)!==catalogId || files.length!==expected.length) throw Error("printful_placement_verification_failed");
  for(const want of expected){
    const found=files.filter(f=>f.type===want.type);
    if(found.length!==1 || found[0].status!=="ok" || found[0].hash!==want.canvas.md5 || found[0].width!==want.canvas.width || found[0].height!==want.canvas.height || found[0].dpi!==want.canvas.dpi || (found[0].options != null && (!Array.isArray(found[0].options) || found[0].options.length!==0))) throw Error("printful_placement_verification_failed");

  }
  return remotePlacementSnapshot(payload,syncId,productId);
}
export type PlacementDependencies = { request:SyncRequest; get:Get; etsyRead:(path:string)=>Promise<Record<string,unknown>>;
  shopId:number; prepareCanvas:(asset:WarlockManifestAsset,position:z.infer<typeof positionSchema>)=>Promise<PreparedCanvas>; verifyAsset:(asset:WarlockManifestAsset)=>Promise<unknown>; temporaryAsset:(asset:WarlockManifestAsset)=>Promise<{url:string}> };
export async function buildPlacementPreview(manifest:WarlockProductManifest, raw:unknown, deps:PlacementDependencies) {
  const input=z.object(placementShape).strict().parse(raw);
  if(input.productId!==manifest.id) throw Error("printful_placement_product_mismatch");
  const physical=manifest.variants.filter(v=>v.fulfillment==="PHYSICAL");
  if(input.variants.length!==physical.length || new Set(input.variants.map(v=>v.variantId)).size!==physical.length || physical.some(v=>!input.variants.some(p=>p.variantId===v.id))) throw Error("printful_placement_variant_set_mismatch");
  const imported=await inspectPrintfulImport(manifest,deps.request);
  if(imported.state!=="IMPORTED") throw Error(imported.errorCode ?? "printful_placement_import_missing");
  const listing=await deps.etsyRead("/listings/"+imported.etsyListingId);
  if(String(listing.listing_id)!==imported.etsyListingId || String(listing.shop_id)!==String(deps.shopId) || !["draft","active"].includes(String(listing.state)) || etsyListingType(listing)!=="physical") throw Error("printful_placement_listing_mismatch");
  const variants=[];
  for(const plan of input.variants){
    const variant=physical.find(v=>v.id===plan.variantId)!;
    const mapped=imported.variants.find(v=>v.variantId===variant.id)!;
    if(!variant.printfulVariantId || !variant.printfulProductId) throw Error("printful_placement_catalog_missing");
    if(new Set(plan.files.map(f=>f.type)).size!==plan.files.length) throw Error("printful_placement_duplicate");
    const detail=record((await deps.get("/products/variant/"+variant.printfulVariantId,imported.storeId)).result);
    if(Number(record(detail.variant).id)!==variant.printfulVariantId || Number(record(detail.product).id)!==variant.printfulProductId) throw Error("printful_catalog_identity_mismatch");
    const definitions=rows(record(detail.product).files);
    const plannedFiles=[];
    for(const file of plan.files){
      if(!definitions.some(d=>d.id===file.type)) throw Error("printful_placement_unsupported");
      const asset=manifest.assets.find(a=>a.id===file.assetId);
      if(!asset || asset.role!=="master" || !["image/png","image/jpeg"].includes(asset.contentType)) throw Error("printful_placement_asset_not_owned");
      if(file.position.left+file.position.width>file.position.area_width || file.position.top+file.position.height>file.position.area_height) throw Error("printful_placement_out_of_bounds");
      await deps.verifyAsset(asset);
      plannedFiles.push({...file,canvas:await deps.prepareCanvas(asset,file.position)});
    }
    const before=remotePlacementSnapshot(await deps.request("/sync/variant/"+mapped.printfulSyncVariantId,imported.storeId!),mapped.printfulSyncVariantId,imported.printfulSyncProductId!);
    if(before.files.some(file=>file.status==="waiting")) throw new PrintfulSyncConfigurationError("printful_file_processing_pending",before.files.flatMap((file,index)=>file.status==="waiting" ? [{field:`files[${index}].status`,reason:"processing",actual:"waiting"}] : []));
    // Quote the proposed placement set with provider catalog prices, including preserved options.
    const proposed={result:{sync_variant:{id:mapped.printfulSyncVariantId,sync_product_id:imported.printfulSyncProductId,variant_id:variant.printfulVariantId,synced:true,is_ignored:false,options:before.options,
      files:plan.files.map((f,i)=>({id:i+1,type:f.type,status:"ok",options:[]}))}}};
    const get:Get=async(path,store)=>path==="/sync/variant/"+mapped.printfulSyncVariantId ? proposed : deps.get(path,store);
    const quote=await quotePrintfulVariant({productId:variant.printfulProductId,catalogVariantId:variant.printfulVariantId,storeId:imported.storeId!,syncVariantId:mapped.printfulSyncVariantId},get);
    if(quote.availability!=="in_stock") throw Error("printful_variant_not_available");
    variants.push({...plan,files:plannedFiles,syncVariantId:mapped.printfulSyncVariantId,catalogVariantId:variant.printfulVariantId,catalogProductId:variant.printfulProductId,before,quote});
  }
  return {schemaVersion:1,productId:manifest.id,canonicalFingerprint:canonicalPlacementFingerprint(manifest),storeId:imported.storeId!,syncProductId:imported.printfulSyncProductId!,etsyListingId:imported.etsyListingId!,expiresAt:new Date(Date.now()+15*60000).toISOString(),variants,etsyMutated:false,positionEncoding:"TRANSPARENT_PNG_300_DPI",physicalPlacementVerification:"MANUAL_REVIEW_REQUIRED",
    nextAction:"Review every file ID, placement and pixel position against approved artwork and the correct catalog print area. Printful sync cannot report physical offsets; review its visual mockups before declaring the product ready. Approve this saved preview with apply_printful_placements. No supplier changes have been made."};
}
export type PlacementPreview=Awaited<ReturnType<typeof buildPlacementPreview>>;
export async function applyPlacementPreview(manifest:WarlockProductManifest, preview:PlacementPreview, deps:PlacementDependencies,
  saveEvidence:(variantId:string,quote:PrintfulQuote,snapshot:unknown)=>Promise<void>) {
  if(preview.productId!==manifest.id || preview.canonicalFingerprint!==canonicalPlacementFingerprint(manifest) || Date.parse(preview.expiresAt)<Date.now()) throw Error("printful_placement_preview_stale");
  // Rebuild the entire preview before any mutation to recheck Etsy, mappings, assets, stock and pricing.
  const fresh=await buildPlacementPreview(manifest,{productId:manifest.id,variants:preview.variants.map(({variantId,files})=>({variantId,files:files.map(({assetId,type,position})=>({assetId,type,position}))}))},deps);
  if(fresh.storeId!==preview.storeId || fresh.syncProductId!==preview.syncProductId || fresh.variants.some((v,i)=>v.syncVariantId!==preview.variants[i].syncVariantId || placementFingerprint(v.before)!==placementFingerprint(preview.variants[i].before) || v.quote.productionBaseCents!==preview.variants[i].quote.productionBaseCents || v.files.some((f,j)=>f.canvas.md5!==preview.variants[i].files[j].canvas.md5))) throw Error("printful_placement_preview_changed");
  const prepared=[];
  for(const variant of fresh.variants){
    const files=[];
    for(const file of variant.files){const asset=file.canvas.asset;files.push({...file,url:(await deps.temporaryAsset(asset)).url,filename:asset.fileName});}
    prepared.push({variant,files});
  }
  const verifiedVariantIds:string[]=[];
  let currentVariantId:string | undefined;
  try {
    for(const {variant,files} of prepared){
      currentVariantId=variant.variantId;
      const currentPayload=await deps.request("/sync/variant/"+variant.syncVariantId,preview.storeId);
      const current=remotePlacementSnapshot(currentPayload,variant.syncVariantId,preview.syncProductId);
      if(placementFingerprint(current)!==placementFingerprint(variant.before)) throw Error("printful_placement_remote_changed");
      // A fresh preview after partial success may already match the approved bytes.
      // Verify and reuse those files; do not send another expiring upload URL.
      let alreadyMatches=false;
      try { verifyPlacementReadback(currentPayload,variant.syncVariantId,preview.syncProductId,variant.catalogVariantId,files); alreadyMatches=true; } catch { /* A changed configuration still requires this approved preview. */ }
      if(!alreadyMatches) await deps.request("/sync/variant/"+variant.syncVariantId,preview.storeId,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({variant_id:variant.catalogVariantId,is_ignored:false,files:files.map(({type,url,filename})=>({type,url,filename,options:[]}))})});
      const observed=await readProcessedConfiguration(()=>deps.request("/sync/variant/"+variant.syncVariantId,preview.storeId),payload=>verifyPlacementReadback(payload,variant.syncVariantId,preview.syncProductId,variant.catalogVariantId,files));
      const quote=await quotePrintfulVariant({productId:variant.catalogProductId,catalogVariantId:variant.catalogVariantId,storeId:preview.storeId,syncVariantId:variant.syncVariantId},deps.get);
      if(quote.configurationKind!=="CONFIGURED_SYNC" || quote.availability!=="in_stock" || quote.productionBaseCents!==variant.quote.productionBaseCents) throw Error("printful_placement_quote_changed");
      // A second read rejects a configuration change during the quote fetch.
      const rechecked=verifyPlacementReadback(await deps.request("/sync/variant/"+variant.syncVariantId,preview.storeId),variant.syncVariantId,preview.syncProductId,variant.catalogVariantId,files);
      if(placementFingerprint(observed)!==placementFingerprint(rechecked)) throw Error("printful_placement_remote_changed");
      await saveEvidence(variant.variantId,quote,rechecked);
      verifiedVariantIds.push(variant.variantId);
    }
    return {state:"PLACEMENT_FILES_VERIFIED",physicalPlacementVerification:"MANUAL_REVIEW_REQUIRED",verifiedVariantIds,etsyMutated:false,checkedAt:new Date().toISOString()};
  } catch(error){return {state:"NEEDS_REVIEW",verifiedVariantIds,variantId:currentVariantId,etsyMutated:false,errorCode:error instanceof Error && /^printful_[a-z0-9_]+$/.test(error.message)?error.message:"printful_placement_apply_failed",
    ...(error instanceof PrintfulSyncConfigurationError ? {configurationIssues:error.configurationIssues} : {}),
    nextAction:error instanceof Error && error.message==="printful_file_processing_pending" ? "Printful is processing the saved files. Inspect with check_printful_import until processing finishes, then create a fresh preview. An approved retry reuses matching files without another supplier upload." : "Some supplier writes may have completed. Inspect and create a fresh placement preview before retrying. Matching verified files are reused; no automatic rollback or listing publication occurred."};}
}
