import { etsyWriteError, etsyFailureDetails } from "./etsy-write-error";
import { randomUUID } from "node:crypto";
import { prisma } from "../prisma";
import { etsyHeaders } from "../etsy-client";
import { getWarlockEtsyOperatorContext } from "../warlock-auth";
import { findWarlockProduct } from "../warlock-mcp/repository";
import { readEtsyForReconciliation } from "./etsy-reconciliation-read";
import { writeEtsyPriceInventory } from "./etsy-price-transport";
import { assertCommerceDraftWritesEnabled } from "./write-guard";
import { printfulGet, quotePrintfulVariant } from "./printful-catalog";
import { runPrintfulSupplierPreflight } from "./printful-preflight";

import { buildGarmentPreview, applyGarmentPreview, reactivateGarmentPreview, inspectUnchangedMigrationSource, readMigrationTarget, safeMigrationError, garmentPreviewSchema, migrationCanonical, migrationMap, validateMigrationAvailability, type MigrationPhase, type GarmentPreview } from "./garment-migration";

async function context(productId:string){
 const manifest=await findWarlockProduct({productId});if(!manifest)throw Error("garment_migration_product_missing");
 const {auth,shopId}=await getWarlockEtsyOperatorContext();
 return {manifest,shopId,read:(path:string)=>readEtsyForReconciliation(auth.session.access_token,path),token:auth.session.access_token};
}
export async function previewGarmentMigration(raw:unknown){
 const input=garmentPreviewSchema.parse(raw),ctx=await context(input.productId);
 const preview=await buildGarmentPreview(ctx.manifest,input,ctx.shopId,ctx.read,printfulGet,randomUUID());
 const saved=await prisma.spellmarkJournal.create({data:{productId:input.productId,requestId:randomUUID(),kind:"GARMENT_MIGRATION_PREVIEW",bodyJson:JSON.stringify(preview)}});
 return {...preview,previewId:saved.id};
}
async function savedPreview(productId:string,previewId:string){
 const saved=await prisma.spellmarkJournal.findFirst({where:{id:previewId,productId,kind:"GARMENT_MIGRATION_PREVIEW"}});
 if(!saved)throw Error("garment_migration_preview_missing");return JSON.parse(saved.bodyJson) as GarmentPreview;
}
async function writeDescription(token:string,shopId:number,listingId:string,description:string){
 const response=await fetch(`https://api.etsy.com/v3/application/shops/${shopId}/listings/${listingId}`,{method:"PATCH",headers:{...etsyHeaders(token),"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({description}),cache:"no-store",redirect:"error",signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw await etsyWriteError(response,"description",[token,...Object.values(etsyHeaders(token))]);
}
async function writeListingState(token:string,shopId:number,listingId:string,state:"inactive"|"active"){
 const response=await fetch(`https://api.etsy.com/v3/application/shops/${shopId}/listings/${listingId}`,{method:"PATCH",headers:{...etsyHeaders(token),"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({state}),cache:"no-store",redirect:"error",signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw await etsyWriteError(response,state==="inactive"?"deactivation":"reactivation",[token,...Object.values(etsyHeaders(token))]);
}
export async function applyGarmentMigration(input:{productId:string;previewId:string;confirmMigration:true;confirmTemporaryUnavailability:true;confirmTemporaryDeactivation:true}){
 assertCommerceDraftWritesEnabled();
 if(input.confirmMigration!==true||input.confirmTemporaryUnavailability!==true||input.confirmTemporaryDeactivation!==true)throw Error("garment_migration_confirmation_required");
 const p=await savedPreview(input.productId,input.previewId),ctx=await context(input.productId);
 if(ctx.shopId!==p.shopId)throw Error("garment_migration_shop_changed");
 const key={productId:input.productId,requestId:"garment-migrate:"+input.previewId};
 const old=await prisma.spellmarkJournal.findUnique({where:{productId_requestId:key}});
 if(old){const result=JSON.parse(old.bodyJson);if(result.state==="GARMENT_MIGRATION_STAGED")return {...result,reused:true};}
 let started=false;let phase:MigrationPhase|undefined;
 const writeWithDiagnostics=async<T>(operation:()=>Promise<T>)=>{
  try{return await operation();}catch(error){
   const supplierError=etsyFailureDetails(error);
   if(supplierError){try{await prisma.spellmarkJournal.update({where:{productId_requestId:key},data:{bodyJson:JSON.stringify({state:"RESPONSE_REJECTED_VERIFY_REQUIRED",previewId:input.previewId,phase,supplierError,rejectedAt:new Date().toISOString()})}});}catch{ /* Preserve the original public rejection; durable STARTED still blocks replay. */ }}
   throw error;
  }
 };
 try{return await prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${"warlock-product-prices:"+input.productId}))::text`;
  await tx.$queryRaw`SELECT id FROM "SpellmarkProduct" WHERE id = ${input.productId} FOR NO KEY UPDATE`;
  await tx.$queryRaw`SELECT id FROM "SpellmarkVariant" WHERE "productId" = ${input.productId} FOR UPDATE`;
  const manifest=await findWarlockProduct({productId:input.productId},tx);if(!manifest)throw Error("garment_migration_product_missing");
  const concurrent=await tx.spellmarkJournal.findUnique({where:{productId_requestId:key}});
  if(concurrent&&JSON.parse(concurrent.bodyJson).state==="GARMENT_MIGRATION_STAGED")return {...JSON.parse(concurrent.bodyJson),reused:true};
  if(concurrent&&JSON.parse(concurrent.bodyJson).state==="NO_CHANGE_VERIFIED")throw Error("garment_migration_fresh_preview_required");
  // Fresh target stock/base quotes precede any inventory or description write.
  const quotes=await migrationMap(p.targets,t=>quotePrintfulVariant({productId:t.catalogProductId,catalogVariantId:t.catalogVariantId,storeId:t.storeId}));
  if(quotes.some((q,i)=>q.availability!=="in_stock"||q.productionBaseCents!==p.targets[i].quote.productionBaseCents))throw Error("garment_migration_stock_or_quote_changed");
  const result=await applyGarmentPreview(manifest,p,{
   read:ctx.read,
   recordIntent:async nextPhase=>{
    phase=nextPhase;
    // Independent commit survives an interrupted external operation or transaction.
    await prisma.spellmarkJournal.upsert({where:{productId_requestId:key},create:{...key,kind:"GARMENT_MIGRATION_RESULT",bodyJson:JSON.stringify({state:"STARTED",previewId:input.previewId,phase,startedAt:new Date().toISOString()})},update:{bodyJson:JSON.stringify({state:"STARTED",previewId:input.previewId,phase,startedAt:new Date().toISOString()})}});started=true;
   },
   writeState:(id,state)=>writeWithDiagnostics(()=>writeListingState(ctx.token,ctx.shopId,id,state)),
   writeInventory:(id,body)=>writeWithDiagnostics(()=>writeEtsyPriceInventory(ctx.token,id,body)),writeDescription:(id,description)=>writeWithDiagnostics(()=>writeDescription(ctx.token,ctx.shopId,id,description)),
   save:async mapped=>{
    for(const t of mapped){
     const previous=manifest.variants.find(v=>v.id===t.sourceVariantId)!;
     const data={label:t.label,fulfillment:"PHYSICAL" as const,printfulProductId:t.catalogProductId,printfulVariantId:t.catalogVariantId,printfulStoreId:t.storeId,
      etsyListingId:p.etsyListingId,etsyProductId:t.etsyProductId,etsySku:t.sku,retailPriceCents:t.retailPriceCents,currency:"USD",
      printfulSyncVariantId:!t.isNew&&previous.etsyProductId===t.etsyProductId?String(previous.printfulSyncVariantId):null,
      productionBaseCents:null,productionQuotedAt:null,productionQuoteJson:null};
     if(t.isNew)await tx.spellmarkVariant.create({data:{...data,id:t.variantId,productId:input.productId}});
     else await tx.spellmarkVariant.update({where:{id:t.variantId},data});
    }
    await tx.spellmarkListing.update({where:{id:p.listingId},data:{description:p.description,status:"MIGRATION_PENDING",lastVerifiedAt:null,observationJson:null}});
   }
  },concurrent?(JSON.parse(concurrent.bodyJson).phase??true):false);
  await tx.spellmarkJournal.update({where:{productId_requestId:key},data:{bodyJson:JSON.stringify({...result,previewId:input.previewId,previousCanonical:manifest,previousAttempt:concurrent?JSON.parse(concurrent.bodyJson):undefined})}});
  return {...result,previewId:input.previewId};
 },{timeout:165000,maxWait:10000});}
 catch(error){return {productId:input.productId,previewId:input.previewId,state:started||old?"VERIFY_OR_RETRY_REQUIRED":"BLOCKED",errorCode:safeMigrationError(error),supplierError:etsyFailureDetails(error),
  nextAction:"Use inspect_garment_migration with the saved previewId to check target inventory or an exact unchanged source. Confirm unchanged-source resolution before creating a fresh preview. Uncertain inventory writes are not replayed. Supplier production is unchanged; the existing listing may already be inactive. Do not rerun draft execution or publish a duplicate listing."};}
}

/** Availability is a separate step after saved placement evidence and owner visual review. */
export async function enableMigratedGarment(input:{productId:string;previewId:string;expectedInventoryFingerprint:string;confirmVisualReview:true;confirmAvailability:true;confirmExistingListingReactivation:true}){
 assertCommerceDraftWritesEnabled();if(input.confirmVisualReview!==true||input.confirmAvailability!==true||input.confirmExistingListingReactivation!==true)throw Error("garment_migration_confirmation_required");
 const p=await savedPreview(input.productId,input.previewId),ctx=await context(input.productId);
 if(ctx.shopId!==p.shopId)throw Error("garment_migration_shop_changed");
 if(p.schemaVersion!==2||p.availabilityStrategy!=="INACTIVE_LISTING")throw Error("garment_migration_fresh_preview_required");
 const migrated=await prisma.spellmarkJournal.findUnique({where:{productId_requestId:{productId:input.productId,requestId:"garment-migrate:"+input.previewId}}});
 if(!migrated||JSON.parse(migrated.bodyJson).state!=="GARMENT_MIGRATION_STAGED")throw Error("garment_migration_not_staged");
 let started=false;
 try{return await prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${"warlock-product-prices:"+input.productId}))::text`;
  await tx.$queryRaw`SELECT id FROM "SpellmarkProduct" WHERE id = ${input.productId} FOR NO KEY UPDATE`;
  await tx.$queryRaw`SELECT id FROM "SpellmarkVariant" WHERE "productId" = ${input.productId} FOR UPDATE`;
  const manifest=await findWarlockProduct({productId:input.productId},tx);if(!manifest)throw Error("garment_migration_product_missing");
  const signature=migrationCanonical(manifest);
  const events=await tx.spellmarkJournal.findMany({where:{productId:input.productId,kind:"PRINTFUL_PLACEMENT_RESULT"},orderBy:{createdAt:"desc"},take:1});
  const evidence=events[0]?JSON.parse(events[0].bodyJson):null;
  const supplier=await runPrintfulSupplierPreflight(manifest);
  validateMigrationAvailability(manifest,p,evidence,supplier);
  const before=await readMigrationTarget(p,ctx.read,"inspect");
  if(String(before.listing.description??"")!==p.description)throw Error("garment_migration_description_changed");
  if(before.mapped.some(t=>manifest.variants.find(v=>v.id===t.variantId)?.etsyProductId!==t.etsyProductId))throw Error("garment_migration_canonical_changed");
  const already=before.listing.state==="active";
  if(!already&&before.observed.fingerprint!==input.expectedInventoryFingerprint)throw Error("garment_migration_inventory_changed");
  const current=await findWarlockProduct({productId:input.productId},tx);
  if(!current||migrationCanonical(current)!==signature)throw Error("garment_migration_canonical_changed");
  // Inventory is already valid and enabled; only the existing listing state changes.
  const key={productId:input.productId,requestId:"garment-enable:"+input.previewId};
  await prisma.spellmarkJournal.upsert({where:{productId_requestId:key},create:{...key,kind:"GARMENT_MIGRATION_AVAILABILITY",bodyJson:JSON.stringify({state:"STARTED",previewId:input.previewId})},update:{}});
  started=true;
  const finalSupplier=await runPrintfulSupplierPreflight(manifest);
  validateMigrationAvailability(manifest,p,evidence,finalSupplier);
  const finalRead=await reactivateGarmentPreview(p,ctx.read,(id,state)=>writeListingState(ctx.token,ctx.shopId,id,state),input.expectedInventoryFingerprint,input.confirmExistingListingReactivation);
  const postSupplier=await runPrintfulSupplierPreflight(manifest);
  validateMigrationAvailability(manifest,p,evidence,postSupplier);
  const verifiedActive=await readMigrationTarget(p,ctx.read,true);
  if(verifiedActive.observed.fingerprint!==finalRead.observed.fingerprint||String(verifiedActive.listing.description??"")!==p.description)throw Error("garment_migration_inventory_changed");
  await tx.spellmarkListing.update({where:{id:p.listingId},data:{status:"SYNCED"}});
  const result={productId:input.productId,previewId:input.previewId,state:"GARMENT_MIGRATION_AVAILABLE",inventoryFingerprint:verifiedActive.observed.fingerprint,
   combinedQuotes:postSupplier.variants.map(v=>({variantId:v.variantId,label:v.label,quote:v.quote})),physicalPlacementVerification:"OWNER_VISUALLY_REVIEWED",listingState:"active",existingListingReactivated:finalRead.existingListingReactivated,
   nextAction:"The approved migrated editions are available and supplier quotes include saved placements. Existing active listing identity is retained; no new listing was published and no orders were placed."};
  await tx.spellmarkJournal.update({where:{productId_requestId:key},data:{bodyJson:JSON.stringify(result)}});return result;
 },{timeout:165000,maxWait:10000});}
 catch(error){return {productId:input.productId,previewId:input.previewId,state:started?"VERIFY_OR_RETRY_REQUIRED":"BLOCKED",errorCode:safeMigrationError(error),supplierError:etsyFailureDetails(error),nextAction:"Inspect current availability before retrying the same migration. Do not enable editions without saved placement evidence, current combined quotes and owner visual review."};}
}

export async function inspectGarmentMigration(input:{productId:string;previewId:string;confirmUnchangedSourceResolution?:true}){
 const p=await savedPreview(input.productId,input.previewId),ctx=await context(input.productId);
 if(ctx.shopId!==p.shopId)throw Error("garment_migration_shop_changed");
 const inspect=async(manifest:NonNullable<Awaited<ReturnType<typeof findWarlockProduct>>>)=>{
  const key={productId:input.productId,requestId:"garment-migrate:"+input.previewId};
  const journal=await prisma.spellmarkJournal.findUnique({where:{productId_requestId:key}});
  const failure=journal?JSON.parse(journal.bodyJson):null;
  let target;
  try{target=await readMigrationTarget(p,ctx.read,"inspect");}catch{
   const source=await inspectUnchangedMigrationSource(manifest,p,ctx.read,p.schemaVersion===2);
   if(input.confirmUnchangedSourceResolution===true){
    if(!failure||!["STARTED","RESPONSE_REJECTED_VERIFY_REQUIRED","NO_CHANGE_VERIFIED","SOURCE_UNCHANGED_DEACTIVATED_RESOLVED"].includes(failure.state))throw Error("garment_migration_failed_intent_required");
    await prisma.spellmarkJournal.update({where:{productId_requestId:key},data:{bodyJson:JSON.stringify({...source,state:source.listingState==="inactive"?"SOURCE_UNCHANGED_DEACTIVATED_RESOLVED":"NO_CHANGE_VERIFIED",phase:source.listingState==="inactive"?"DEACTIVATION_VERIFIED":undefined,previewId:input.previewId,resolvedAt:new Date().toISOString(),previousFailure:["NO_CHANGE_VERIFIED","SOURCE_UNCHANGED_DEACTIVATED_RESOLVED"].includes(failure.state)?failure.previousFailure:failure})}});
   }
   return {...source,productId:input.productId,previewId:input.previewId,resolved:input.confirmUnchangedSourceResolution===true,supplierError:failure?.supplierError??failure?.previousFailure?.supplierError??null,
    nextAction:source.listingState==="inactive"?(input.confirmUnchangedSourceResolution===true?"Verified inactive original inventory; failed inventory outcome resolved. Resume the SAME version-2 preview to stage the approved target. Keep the listing inactive until placements and visual review pass.":"Listing is inactive and original inventory is unchanged. Confirm unchanged-source resolution to allow an explicit same-preview resume; no uncertain inventory PUT is replayed automatically."):input.confirmUnchangedSourceResolution===true?"Failed intent resolved by exact live source readback. Create and approve a FRESH migration preview; do not reuse this expired or rejected preview. No Etsy or supplier writes were made.":"Source inventory, listing and description exactly match the saved pre-migration snapshot. Call inspect_garment_migration with confirmUnchangedSourceResolution:true to record resolution, then create a fresh owner-approved preview. This inspection performs no Etsy or supplier writes."};
  }
  return {productId:input.productId,previewId:input.previewId,state:"GARMENT_MIGRATION_INSPECTED",inventoryFingerprint:target.observed.fingerprint,
   listingState:String(target.listing.state),editionsAvailable:target.listing.state==="active"&&target.observed.body.products.every(v=>v.offerings[0].is_enabled),descriptionMatches:String(target.listing.description??"")===p.description,supplierError:failure?.supplierError??null,
   variants:target.mapped.map(t=>({variantId:t.variantId,label:t.label,etsyProductId:t.etsyProductId,catalogProductId:t.catalogProductId,catalogVariantId:t.catalogVariantId})),
   nextAction:"Target inventory exists. Resume the same previewId to finish staging if necessary; never replace an uncertain saved target with a fresh migration. Enable only after placements and revised mockups have been approved and verified."};
 };
 if(input.confirmUnchangedSourceResolution!==true)return inspect(ctx.manifest);
 // Serialize the durable resolution with apply, then inspect again under the product lock.
 return prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${"warlock-product-prices:"+input.productId}))::text`;
  await tx.$queryRaw`SELECT id FROM "SpellmarkProduct" WHERE id = ${input.productId} FOR NO KEY UPDATE`;
  await tx.$queryRaw`SELECT id FROM "SpellmarkVariant" WHERE "productId" = ${input.productId} FOR UPDATE`;
  const manifest=await findWarlockProduct({productId:input.productId},tx);if(!manifest)throw Error("garment_migration_product_missing");
  return inspect(manifest);
 },{timeout:60000,maxWait:10000});
}
