import { createHash } from "node:crypto";
import * as z from "zod/v4";
import { prisma } from "../prisma";

export const excludePreDraftVariantsShape = {
  productId: z.string().trim().min(1).max(100),
  variantIds: z.array(z.string().trim().min(1).max(100)).min(1).max(100),
  confirmVariantRemoval: z.literal(true),
};

export async function excludePreDraftVariants(input: z.infer<z.ZodObject<typeof excludePreDraftVariantsShape>>, db = prisma) {
  const ids = input.variantIds;
  if (new Set(ids).size !== ids.length) throw new Error("duplicate_variant_removal_id");
  const sortedIds = [...ids].sort();
  const requestId = "variant-removal:" + createHash("sha256").update(JSON.stringify(sortedIds)).digest("hex");
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "SpellmarkProduct" WHERE id = ${input.productId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "SpellmarkListing" WHERE "productId" = ${input.productId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "SpellmarkVariant" WHERE "productId" = ${input.productId} FOR UPDATE`;
    const product = await tx.spellmarkProduct.findUnique({
      where: { id: input.productId }, include: { variants: true, listings: true },
    });
    if (!product) throw new Error("product_not_found");
    if (product.listings.some(l => l.etsyListingId || l.printfulSyncProductId))
      throw new Error("variant_removal_requires_reconciliation");
    const existing = product.variants.filter(v => ids.includes(v.id));
    const previous = await tx.spellmarkJournal.findFirst({ where: { productId: input.productId, requestId } });
    if (existing.length !== ids.length) {
      if (previous && existing.length === 0)
        return { productId: input.productId, excludedVariantIds: sortedIds, alreadyApplied: true, etsyMutated: false, printfulMutated: false };
      throw new Error("variant_removal_not_owned_by_product");
    }
    if (existing.some(v => v.etsyListingId || v.etsyProductId || v.etsySku || v.printfulSyncVariantId))
      throw new Error("variant_removal_requires_reconciliation");
    const remaining = product.variants.filter(v => !ids.includes(v.id));
    if (!remaining.length || product.listings.some(l => !remaining.some(v => v.fulfillment === l.fulfillment)))
      throw new Error("variant_removal_would_orphan_listing");
    if (previous) throw new Error("variant_removal_state_changed");
    await tx.spellmarkJournal.create({
      data: { productId: input.productId, requestId, kind: "PRE_DRAFT_VARIANTS_REMOVED",
        bodyJson: JSON.stringify({ variantIds: sortedIds, archive: existing, etsyMutated: false, printfulMutated: false }) },
    });
    const deleted = await tx.spellmarkVariant.deleteMany({ where: { productId: input.productId, id: { in: sortedIds } } });
    if (deleted.count !== existing.length) throw new Error("variant_removal_state_changed");
    return { productId: input.productId, excludedVariantIds: sortedIds, remainingVariantIds: remaining.map(v => v.id), alreadyApplied: false, etsyMutated: false, printfulMutated: false };
  }, { timeout: 60000, maxWait: 10000 });
}
