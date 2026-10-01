import * as z from "zod/v4";
import type { PrismaClient } from "../../app/generated/prisma/client";

const cents=z.number().int().positive().max(2147483647);
export const productPricesShape={
  productId:z.string().trim().min(1).max(100),
  prices:z.array(z.object({
    variantId:z.string().trim().min(1).max(100),
    expectedRetailPriceCents:z.number().int().min(0).max(2147483647).nullable(),
    retailPriceCents:cents,
  }).strict()).min(1).max(30),
  confirmPrices:z.literal(true),
};
const schema=z.object(productPricesShape).strict();

/** Canonical retail edits only. Works after draft execution without reopening intake. */
export async function updateProductPrices(raw:unknown, db:PrismaClient){
  const input=schema.parse(raw);
  if(new Set(input.prices.map(p=>p.variantId)).size!==input.prices.length) throw new Error("duplicate_price_variant");
  const prices=await db.$transaction(async tx=>{
    const variants=await tx.spellmarkVariant.findMany({where:{productId:input.productId,id:{in:input.prices.map(p=>p.variantId)}}});
    if(variants.length!==input.prices.length) throw new Error("price_variant_not_owned_by_product");
    // Validate the whole batch before writing. A replay of the same target is a no-op.
    for(const change of input.prices){
      const before=variants.find(v=>v.id===change.variantId)!;
      if(before.currency!=="USD") throw new Error("price_currency_not_supported");
      if(before.retailPriceCents!==change.expectedRetailPriceCents && before.retailPriceCents!==change.retailPriceCents) throw new Error("retail_price_changed_retry");
    }
    const result=[];
    for(const change of input.prices){
      const before=variants.find(v=>v.id===change.variantId)!;
      const changed=before.retailPriceCents!==change.retailPriceCents;
      if(changed){
        const updated=await tx.spellmarkVariant.updateMany({where:{id:before.id,productId:input.productId,
          retailPriceCents:before.retailPriceCents,currency:"USD",updatedAt:before.updatedAt},data:{retailPriceCents:change.retailPriceCents}});
        if(updated.count!==1) throw new Error("retail_price_changed_retry");
      }
      result.push({variantId:before.id,label:before.label,previousRetailPriceCents:before.retailPriceCents,retailPriceCents:change.retailPriceCents,currency:"USD",changed,etsyListingId:before.etsyListingId});
    }
    return result;
  },{isolationLevel:"Serializable"});
  return {productId:input.productId,state:"CANONICAL_PRICES_SAVED",prices,etsyMutated:false,printfulMutated:false,
    nextAction:"Warlock retail prices are saved. Re-evaluate margins with current supplier quotes. Etsy and Printful retail prices are unchanged; verify and edit Etsy prices separately. For active listings, do not rerun intake or draft execution to change prices."};
}
export function safeProductPriceError(error:unknown){
  if(error && typeof error==="object" && "code" in error && error.code==="P2034") return "retail_price_changed_retry";
  const message=error instanceof Error ? error.message : "";
  return /^(?:duplicate_price_variant|price_variant_not_owned_by_product|price_currency_not_supported|retail_price_changed_retry)$/.test(message) ? message : "canonical_price_update_failed";
}
