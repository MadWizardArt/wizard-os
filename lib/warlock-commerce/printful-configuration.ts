import type { PrismaClient } from "../../app/generated/prisma/client";
import { quotePrintfulVariant } from "./printful-catalog.ts";

type Selection = { productId:string; variantId:string; catalogProductId:number; catalogVariantId:number; storeId:number };
export async function configurePrintfulVariant(input:Selection, db:PrismaClient, quote=quotePrintfulVariant) {
  const before=await db.spellmarkVariant.findFirst({where:{id:input.variantId,productId:input.productId}});
  if(!before || before.fulfillment!=="PHYSICAL") throw new Error("physical_variant_not_owned_by_product");
  const current=await quote({productId:input.catalogProductId,catalogVariantId:input.catalogVariantId,storeId:input.storeId});
  if(current.availability!=="in_stock") throw new Error("printful_variant_not_available");
  if(before.etsyListingId && (before.printfulProductId!==input.catalogProductId || before.printfulVariantId!==input.catalogVariantId || before.printfulStoreId!==input.storeId)) throw new Error("executed_variant_mapping_locked");
  // An optimistic guard rejects edits or draft execution that raced the API quote.
  const updated=await db.spellmarkVariant.updateMany({where:{id:before.id,productId:input.productId,fulfillment:"PHYSICAL",
    printfulProductId:before.printfulProductId,printfulVariantId:before.printfulVariantId,printfulStoreId:before.printfulStoreId,
    etsyListingId:before.etsyListingId,retailPriceCents:before.retailPriceCents,updatedAt:before.updatedAt},
    data:{printfulProductId:input.catalogProductId,printfulVariantId:input.catalogVariantId,printfulStoreId:input.storeId,
      productionBaseCents:current.productionBaseCents,productionQuotedAt:new Date(current.quotedAt),currency:current.currency,
      productionQuoteJson:JSON.stringify(current)}});
  if(updated.count!==1) throw new Error("printful_configuration_changed_retry");
  return {productId:input.productId,variantId:input.variantId,quote:current,retailPriceCents:before.retailPriceCents,
    nextAction:"Evaluate margins at the approved retail price. Execution rechecks costs and stock live; this is a dated quote, not a fixed supplier price."};
}
