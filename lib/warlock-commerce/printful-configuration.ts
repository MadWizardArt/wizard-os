import type { PrismaClient } from "../../app/generated/prisma/client";
import { exposedSyncId } from "./sync-id-storage.ts";
import { quotePrintfulVariant } from "./printful-catalog.ts";
import { importedDraftContext, verifyImportedDraftMapping } from "./imported-draft-mapping.ts";

type Selection = { productId:string; variantId:string; catalogProductId:number; catalogVariantId:number; storeId:number };
export async function configurePrintfulVariant(input:Selection, db:PrismaClient, quote=quotePrintfulVariant, draftContext=importedDraftContext) {
  const before=await db.spellmarkVariant.findFirst({where:{id:input.variantId,productId:input.productId}});
  if(!before || before.fulfillment!=="PHYSICAL") throw new Error("physical_variant_not_owned_by_product");
  const current=await quote({productId:input.catalogProductId,catalogVariantId:input.catalogVariantId,storeId:input.storeId,...(before.printfulSyncVariantId ? {syncVariantId:exposedSyncId(before.printfulSyncVariantId)!} : {})});
  if(current.availability!=="in_stock") throw new Error("printful_variant_not_available");
  const mappingChanged=before.printfulProductId!==input.catalogProductId || before.printfulVariantId!==input.catalogVariantId || before.printfulStoreId!==input.storeId;
  const recover=!!before.etsyListingId && mappingChanged;
  if(recover && (before.printfulProductId!==null || before.printfulVariantId!==null || before.printfulStoreId!==null || before.printfulSyncVariantId)) throw new Error("executed_variant_mapping_locked");
  const save=async (writer:Pick<PrismaClient,"spellmarkVariant">)=>{
  // An optimistic guard rejects edits or draft execution that raced the API quote.
  const updated=await writer.spellmarkVariant.updateMany({where:{id:before.id,productId:input.productId,fulfillment:"PHYSICAL",
    printfulProductId:before.printfulProductId,printfulVariantId:before.printfulVariantId,printfulStoreId:before.printfulStoreId,
    etsyListingId:before.etsyListingId,etsyProductId:before.etsyProductId,etsySku:before.etsySku,label:before.label,printfulSyncVariantId:before.printfulSyncVariantId,retailPriceCents:before.retailPriceCents,updatedAt:before.updatedAt},
    data:{printfulProductId:input.catalogProductId,printfulVariantId:input.catalogVariantId,printfulStoreId:input.storeId,
      productionBaseCents:current.productionBaseCents,productionQuotedAt:new Date(current.quotedAt),currency:current.currency,
      productionQuoteJson:JSON.stringify(current)}});
  if(updated.count!==1) throw new Error("printful_configuration_changed_retry");
  };
  if(recover) {
    const {shopId,read}=await draftContext();
    await db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${"warlock-product-prices:"+input.productId}))::text`;
      await tx.$queryRaw`SELECT id FROM "SpellmarkListing" WHERE "productId" = ${input.productId} FOR UPDATE`;
      const listing=await tx.spellmarkListing.findUnique({where:{productId_fulfillment:{productId:input.productId,fulfillment:"PHYSICAL"}}});
      await verifyImportedDraftMapping(before,listing,shopId,read);
      await save(tx);
    },{timeout:60000,maxWait:5000});
  } else await save(db);
  return {productId:input.productId,variantId:input.variantId,quote:current,retailPriceCents:before.retailPriceCents,
    nextAction:"Evaluate margins at the approved retail price. Execution rechecks costs and stock live; this is a dated quote, not a fixed supplier price."};
}
