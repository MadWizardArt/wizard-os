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

import { buildGarmentPreview, applyGarmentPreview, readMigrationTarget, safeMigrationError, garmentPreviewSchema, migrationCanonical, migrationMap, validateMigrationAvailability, type GarmentPreview } from "./garment-migration";

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
 if(!response.ok)throw Error("etsy_http_"+response.status);
}
export async function applyGarmentMigration(input:{productId:string;previewId:string;confirmMigration:true;confirmTemporaryUnavailability:true}){
 assertCommerceDraftWritesEnabled();
 if(input.confirmMigration!==true||input.confirmTemporaryUnavailability!==true)throw Error("garment_migration_confirmation_required");
 const p=await savedPreview(input.productId,input.previewId),ctx=await context(input.productId);
 if(ctx.shopId!==p.shopId)throw Error("garment_migration_shop_changed");
 const key={productId:input.productId,requestId:"garment-migrate:"+input.previewId};
 const old=await prisma.spellmarkJournal.findUnique({where:{productId_requestId:key}});
 if(old){const result=JSON.parse(old.bodyJson);if(result.state==="GARMENT_MIGRATION_STAGED")return {...result,reused:true};}
 let started=false;
 try{return await prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${"warlock-product-prices:"+input.productId}))::text`;
  await tx.$queryRaw`SELECT id FROM "SpellmarkProduct" WHERE id = ${input.productId} FOR NO KEY UPDATE`;
  await tx.$queryRaw`SELECT id FROM "SpellmarkVariant" WHERE "productId" = ${input.productId} FOR UPDATE`;
  const manifest=await findWarlockProduct({productId:input.productId},tx);if(!manifest)throw Error("garment_migration_product_missing");
  const concurrent=await tx.spellmarkJournal.findUnique({where:{productId_requestId:key}});
  if(concurrent&&JSON.parse(concurrent.bodyJson).state==="GARMENT_MIGRATION_STAGED")return {...JSON.parse(concurrent.bodyJson),reused:true};
  // Fresh target stock/base quotes precede any inventory or description write.
  const quotes=await migrationMap(p.targets,t=>quotePrintfulVariant({productId:t.catalogProductId,catalogVariantId:t.catalogVariantId,storeId:t.storeId}));
  if(quotes.some((q,i)=>q.availability!=="in_stock"||q.productionBaseCents!==p.targets[i].quote.productionBaseCents))throw Error("garment_migration_stock_or_quote_changed");
  const result=await applyGarmentPreview(manifest,p,{
   read:ctx.read,
   recordIntent:async()=>{
    // Independent commit survives an interrupted external operation or transaction.
    await prisma.spellmarkJournal.upsert({where:{productId_requestId:key},create:{...key,kind:"GARMENT_MIGRATION_RESULT",bodyJson:JSON.stringify({state:"STARTED",previewId:input.previewId,startedAt:new Date().toISOString()})},update:{}});started=true;
   },
   writeInventory:(id,body)=>writeEtsyPriceInventory(ctx.token,id,body),writeDescription:(id,description)=>writeDescription(ctx.token,ctx.shopId,id,description),
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
  },Boolean(concurrent));
  await tx.spellmarkJournal.update({where:{productId_requestId:key},data:{bodyJson:JSON.stringify({...result,previewId:input.previewId,previousCanonical:manifest})}});
  return {...result,previewId:input.previewId};
 },{timeout:165000,maxWait:10000});}
 catch(error){return {productId:input.productId,previewId:input.previewId,state:started||old?"VERIFY_OR_RETRY_REQUIRED":"BLOCKED",errorCode:safeMigrationError(error),
  nextAction:"Inspect Etsy inventory and description before retrying the same previewId. Uncertain inventory writes are not replayed. Supplier production is unchanged; affected editions may already be disabled. Do not rerun draft execution or publish a duplicate listing."};}
}

/** Availability is a separate step after saved placement evidence and owner visual review. */
export async function enableMigratedGarment(input:{productId:string;previewId:string;expectedInventoryFingerprint:string;confirmVisualReview:true;confirmAvailability:true}){
 assertCommerceDraftWritesEnabled();if(input.confirmVisualReview!==true||input.confirmAvailability!==true)throw Error("garment_migration_confirmation_required");
 const p=await savedPreview(input.productId,input.previewId),ctx=await context(input.productId);
 if(ctx.shopId!==p.shopId)throw Error("garment_migration_shop_changed");
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
  const before=await readMigrationTarget(p,ctx.read,false).catch(()=>readMigrationTarget(p,ctx.read,true));
  if(String(before.listing.description??"")!==p.description)throw Error("garment_migration_description_changed");
  if(before.mapped.some(t=>manifest.variants.find(v=>v.id===t.variantId)?.etsyProductId!==t.etsyProductId))throw Error("garment_migration_canonical_changed");
  const already=before.observed.body.products.every(v=>v.offerings[0].is_enabled);
  if(!already&&before.observed.fingerprint!==input.expectedInventoryFingerprint)throw Error("garment_migration_inventory_changed");
  const current=await findWarlockProduct({productId:input.productId},tx);
  if(!current||migrationCanonical(current)!==signature)throw Error("garment_migration_canonical_changed");
  const desired=structuredClone(before.observed.body);desired.products.forEach(v=>v.offerings[0].is_enabled=true);
  const key={productId:input.productId,requestId:"garment-enable:"+input.previewId};
  await prisma.spellmarkJournal.upsert({where:{productId_requestId:key},create:{...key,kind:"GARMENT_MIGRATION_AVAILABILITY",bodyJson:JSON.stringify({state:"STARTED",previewId:input.previewId})},update:{}});
  started=true;
  if(!already)await writeEtsyPriceInventory(ctx.token,p.etsyListingId,desired);
  const after=await readMigrationTarget(p,ctx.read,true);
  if(String(after.listing.description??"")!==p.description)throw Error("garment_migration_description_changed");
  const finalSupplier=await runPrintfulSupplierPreflight(manifest);
  validateMigrationAvailability(manifest,p,evidence,finalSupplier);
  const finalRead=await readMigrationTarget(p,ctx.read,true);
  if(String(finalRead.listing.description??"")!==p.description)throw Error("garment_migration_description_changed");
  await tx.spellmarkListing.update({where:{id:p.listingId},data:{status:"SYNCED"}});
  const result={productId:input.productId,previewId:input.previewId,state:"GARMENT_MIGRATION_AVAILABLE",inventoryFingerprint:finalRead.observed.fingerprint,
   combinedQuotes:finalSupplier.variants.map(v=>({variantId:v.variantId,label:v.label,quote:v.quote})),physicalPlacementVerification:"OWNER_VISUALLY_REVIEWED",
   nextAction:"The approved migrated editions are available and supplier quotes include saved placements. Existing active listing identity is retained; no new listing was published and no orders were placed."};
  await tx.spellmarkJournal.update({where:{productId_requestId:key},data:{bodyJson:JSON.stringify(result)}});return result;
 },{timeout:165000,maxWait:10000});}
 catch(error){return {productId:input.productId,previewId:input.previewId,state:started?"VERIFY_OR_RETRY_REQUIRED":"BLOCKED",errorCode:safeMigrationError(error),nextAction:"Inspect current availability before retrying the same migration. Do not enable editions without saved placement evidence, current combined quotes and owner visual review."};}
}

export async function inspectGarmentMigration(input:{productId:string;previewId:string}){
 const p=await savedPreview(input.productId,input.previewId),ctx=await context(input.productId);
 if(ctx.shopId!==p.shopId)throw Error("garment_migration_shop_changed");
 const target=await readMigrationTarget(p,ctx.read,false).catch(()=>readMigrationTarget(p,ctx.read,true));
 return {productId:input.productId,previewId:input.previewId,state:"GARMENT_MIGRATION_INSPECTED",inventoryFingerprint:target.observed.fingerprint,
  editionsAvailable:target.observed.body.products.every(v=>v.offerings[0].is_enabled),descriptionMatches:String(target.listing.description??"")===p.description,
  variants:target.mapped.map(t=>({variantId:t.variantId,label:t.label,etsyProductId:t.etsyProductId,catalogProductId:t.catalogProductId,catalogVariantId:t.catalogVariantId})),
  nextAction:"Use this fresh inventory fingerprint for enable_migrated_garment only after placements and revised mockups have been approved and verified."};
}
