import { randomUUID } from "node:crypto";
import { prisma } from "../prisma";
import { findWarlockProduct } from "../warlock-mcp/repository";
import { getWarlockEtsyOperatorContext } from "../warlock-auth";
import { readEtsyForReconciliation } from "./etsy-reconciliation-read";
import { listingLinkPreviewSchema, listingLinkApplySchema, buildListingLinkPreview,
  validateListingLinkPreview, type ListingLinkPreview, type ListingLinkRead } from "./etsy-listing-link.ts";

async function context() {
  const { auth, shopId } = await getWarlockEtsyOperatorContext();
  const read: ListingLinkRead = path => readEtsyForReconciliation(auth.session.access_token, path);
  return { shopId, read };
}
async function assertTargetUnlinked(db: Pick<typeof prisma, "spellmarkListing" | "spellmarkVariant">, target: string | null) {
  if (!target) return;
  const [listing, variant] = await Promise.all([
    db.spellmarkListing.findFirst({ where: { etsyListingId: target }, select: { id: true } }),
    db.spellmarkVariant.findFirst({ where: { etsyListingId: target }, select: { id: true } }),
  ]);
  if (listing || variant) throw Error("etsy_link_target_already_linked");
}

/** Preview persists review evidence only. All Etsy access uses the GET-only transport. */
export async function previewEtsyListingLink(raw: unknown) {
  const input = listingLinkPreviewSchema.parse(raw), product = await findWarlockProduct({ productId: input.productId });
  if (!product) throw Error("etsy_link_product_missing");
  await assertTargetUnlinked(prisma, input.targetEtsyListingId);
  const { shopId, read } = await context();
  const result = await buildListingLinkPreview(product, input, shopId, read);
  if (result.state !== "PREVIEW_READY") return { ...result, productId: product.id, etsyMutated: false, printfulMutated: false };
  const saved = await prisma.spellmarkJournal.create({ data: { productId: product.id, requestId: randomUUID(),
    kind: "ETSY_LISTING_LINK_PREVIEW", bodyJson: JSON.stringify(result.preview) } });
  return { ...result, previewId: saved.id, etsyMutated: false, printfulMutated: false,
    changes: { preserveProductAssetsPricesAndCatalogMappings: true, clearOldRemoteAssetAndSupplierLinks: true,
      preserveOldLinksInLedger: true, preserveRemoteListingState: true, createEtsyListing: false, deleteEtsyListing: false },
    nextAction: "Show the exact preview to the owner. Only apply this previewId after approval with confirmListingLink:true. A 404 means NOT_FOUND, not an independently proven deletion. Existing Etsy/Printful listings and files are never deleted." };
}

/** Only canonical linkage is changed; no external mutation or blob deletion exists here. */
export async function applyEtsyListingLink(raw: unknown) {
  const input = listingLinkApplySchema.parse(raw), { shopId, read } = await context();
  const saved = await prisma.spellmarkJournal.findFirst({ where: { id: input.previewId, productId: input.productId,
    kind: "ETSY_LISTING_LINK_PREVIEW" } });
  if (!saved) throw Error("etsy_link_preview_not_found");
  const preview = JSON.parse(saved.bodyJson) as ListingLinkPreview;
  if (preview.input.productId !== input.productId) throw Error("etsy_link_preview_product_mismatch");
  return prisma.$transaction(async tx => {
    const target = preview.input.targetEtsyListingId;
    // Serialize target adoption across products as well as canonical edits to this product.
    if (target) await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${"etsy-listing-link:" + target}))::text`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${"warlock-product-prices:" + input.productId}))::text`;
    await tx.$queryRaw`SELECT id FROM "SpellmarkProduct" WHERE id = ${input.productId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "SpellmarkListing" WHERE "productId" = ${input.productId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "SpellmarkVariant" WHERE "productId" = ${input.productId} FOR UPDATE`;
    await tx.$queryRaw`SELECT a.id FROM "SpellmarkListingAsset" a JOIN "SpellmarkListing" l ON l.id = a."listingId" WHERE l."productId" = ${input.productId} FOR UPDATE OF a`;
    const key = { productId: input.productId, requestId: "etsy-listing-link-apply:" + saved.id };
    const old = await tx.spellmarkJournal.findUnique({ where: { productId_requestId: key } });
    if (old) {
      const { archive: _archive, approvedSnapshot: _snapshot, ...previous } = JSON.parse(old.bodyJson);
      return { ...previous, reused: true, historical: true,
        nextAction: "This approved operation was already applied; no writes were repeated. Inspect get_product for the current link." };
    }
    const product = await findWarlockProduct({ productId: input.productId }, tx);
    if (!product) throw Error("etsy_link_product_missing");
    await assertTargetUnlinked(tx, target);
    const snapshot = await validateListingLinkPreview(product, preview, shopId, read);
    if (Date.now() >= Date.parse(preview.expiresAt)) throw Error("etsy_link_preview_expired");
    const listing = product.listings.find(l => l.fulfillment === preview.input.fulfillment)!;
    const variants = product.variants.filter(v => v.fulfillment === preview.input.fulfillment);
    // The archive and all resets commit together. Keep product-owned files and canonical catalog mappings.
    const archive = { listing, variants };
    await tx.spellmarkListing.update({ where: { id: listing.id }, data: {
      etsyListingId: target, printfulSyncProductId: null, status: target ? "DRAFT_CREATED" : "CONFIG",
      lastDraftSyncAt: null, lastVerifiedAt: null, observationJson: snapshot.target?.state === "active" ? JSON.stringify({ source: "ETSY_LISTING_LINK", previewId: saved.id, snapshot }) : null,
      etsyConfigurationEvidenceJson: null, etsyDraftSettingsVerificationJson: null,
    } });
    await tx.spellmarkListingAsset.updateMany({ where: { listingId: listing.id }, data: { etsyRemoteId: null, etsySyncedAt: null } });
    for (const v of variants) {
      const mapping = snapshot.mappings.find(m => m.variantId === v.id);
      await tx.spellmarkVariant.update({ where: { id: v.id }, data: {
        etsyListingId: target, etsyProductId: mapping?.etsyProductId ?? null, etsySku: mapping?.sku ?? null,
        printfulSyncVariantId: null,
        ...(v.fulfillment === "PHYSICAL" ? { productionBaseCents: null, productionQuotedAt: null, productionQuoteJson: null } : {}),
      } });
    }
    const result = { state: target ? (snapshot.target?.state === "active" ? "EXISTING_ACTIVE_LISTING_LINKED" : "EXISTING_DRAFT_LINKED") : "MISSING_ETSY_LINK_CLEARED",
      remoteState: snapshot.target?.state ?? null, productId: product.id,
      fulfillment: listing.fulfillment, previewId: saved.id, listingId: listing.id,
      previousEtsyListingId: preview.input.expectedEtsyListingId, etsyListingId: target,
      appliedAt: new Date().toISOString(), etsyMutated: false, printfulMutated: false, published: false,
      supplierVerificationPending: listing.fulfillment === "PHYSICAL", visualVerificationPending: true,
      nextAction: target ? "Use inspect_etsy_listing_images and the approved existing image tools for this existing listing. Do not create a duplicate. Recheck configuration, supplier import, explicit placements, combined quotes and owner visual review independently."
        : "The stale Etsy link is cleared. Product files, copy, prices and catalog mappings remain available. Link an existing draft or active listing with a fresh preview or prepare a separately approved new draft." };
    await tx.spellmarkJournal.create({ data: { ...key, kind: "ETSY_LISTING_LINK_RESULT",
      bodyJson: JSON.stringify({ ...result, archive, approvedSnapshot: snapshot }) } });
    // Do not return the bulky archive; it is available through the canonical ledger.
    return result;
  }, { timeout: 90_000, maxWait: 10_000 });
}
