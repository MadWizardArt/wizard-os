import { prisma } from "../prisma";
import { findWarlockProduct } from "../warlock-mcp/repository";
import { getWarlockEtsyOperatorContext } from "../warlock-auth";
import { readEtsyForReconciliation } from "./etsy-reconciliation-read";
import { draftImportPreviewSchema, draftImportApplySchema, buildDraftImportPreview, validateDraftImportPreview, type DraftImportPreview } from "./etsy-draft-import.ts";
async function context() {
  const { auth, shopId } = await getWarlockEtsyOperatorContext();
  return { shopId, read: (path: string) => readEtsyForReconciliation(auth.session.access_token, path) };
}
async function checkTarget(db: Pick<typeof prisma, "spellmarkListing" | "spellmarkVariant">, target: string, productId: string | null, fulfillment?: string) {
  const [listings, variants] = await Promise.all([
    db.spellmarkListing.findMany({ where: { etsyListingId: target }, select: { productId: true, fulfillment: true } }),
    db.spellmarkVariant.findMany({ where: { etsyListingId: target }, select: { productId: true, fulfillment: true } }),
  ]);
  if ([...listings, ...variants].some(v => v.productId !== productId || (fulfillment && v.fulfillment !== fulfillment))) throw Error("etsy_import_target_already_linked");
}
export async function previewEtsyDraftImport(raw: unknown) {
  const input = draftImportPreviewSchema.parse(raw);
  const product = input.productId ? await findWarlockProduct({ productId: input.productId }) : null;
  if (input.productId && !product) throw Error("etsy_import_product_missing");
  await checkTarget(prisma, input.etsyListingId, input.productId);
  const { shopId, read } = await context();
  const preview = await buildDraftImportPreview(product, input, shopId, read);
  await checkTarget(prisma, input.etsyListingId, input.productId, preview.snapshot.fulfillment);
  const saved = await prisma.spellmarkDraftImportPreview.create({ data: { bodyJson: JSON.stringify(preview), expiresAt: new Date(preview.expiresAt) } });
  return { state: "PREVIEW_READY", previewId: saved.id, preview,
    changes: { createCanonicalProduct: !product, replaceSelectedCanonicalCopyPricesAndVariantsFromEtsy: true,
      preserveExistingProductAssetsMetadataAndOtherFulfillment: true, archiveReplacedRecords: true,
      inferPrintfulMappings: false, uploadMockups: false, etsyMutated: false, published: false },
    nextAction: "Show this exact preview, including old/new copy, prices, all variants and warnings, for owner approval. Apply with confirmImport:true. Do not intake or create a duplicate Etsy draft. Mockup uploads are a separate approved image edit after import." };
}
export async function applyEtsyDraftImport(raw: unknown) {
  const input = draftImportApplySchema.parse(raw);
  const saved = await prisma.spellmarkDraftImportPreview.findUnique({ where: { id: input.previewId } });
  if (!saved) throw Error("etsy_import_preview_not_found");
  const preview = JSON.parse(saved.bodyJson) as DraftImportPreview;
  // Completed retries need no remote access and never replay canonical writes.
  if (saved.resultJson) return { ...JSON.parse(saved.resultJson), reused: true, historical: true };
  const { shopId, read } = await context();
  return prisma.$transaction(async tx => {
    const target = preview.input.etsyListingId, productId = preview.input.productId;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${"etsy-listing-link:" + target}))::text`;
    await tx.$queryRaw`SELECT id FROM "SpellmarkDraftImportPreview" WHERE id = ${saved.id} FOR UPDATE`;
    const locked = await tx.spellmarkDraftImportPreview.findUnique({ where: { id: saved.id } });
    if (!locked || locked.bodyJson !== saved.bodyJson) throw Error("etsy_import_preview_changed");
    if (locked.resultJson) return { ...JSON.parse(locked.resultJson), reused: true, historical: true };
    if (productId) {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${"warlock-product-prices:" + productId}))::text`;
      await tx.$queryRaw`SELECT id FROM "SpellmarkProduct" WHERE id = ${productId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "SpellmarkListing" WHERE "productId" = ${productId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "SpellmarkVariant" WHERE "productId" = ${productId} FOR UPDATE`;
      await tx.$queryRaw`SELECT a.id FROM "SpellmarkListingAsset" a JOIN "SpellmarkListing" l ON l.id = a."listingId" WHERE l."productId" = ${productId} FOR UPDATE OF a`;
    }
    const product = productId ? await findWarlockProduct({ productId }, tx) : null;
    await checkTarget(tx, target, productId, preview.snapshot.fulfillment);
    const snapshot = await validateDraftImportPreview(product, preview, shopId, read);
    const imported = product ?? await tx.spellmarkProduct.create({ data: { title: snapshot.listing.title,
      description: snapshot.listing.description, collection: preview.input.collection ?? "", status: "DESIGN" } });
    const previousListing = snapshot.previous.listing;
    // Keep Ads and structured digital intent as intent, without claiming remote verification.
    const listing = await tx.spellmarkListing.upsert({ where: { productId_fulfillment: { productId: imported.id, fulfillment: snapshot.fulfillment } },
      create: { ...snapshot.listing, productId: imported.id, etsyListingId: target, status: "DRAFT_CREATED", lastVerifiedAt: new Date(),
        observationJson: JSON.stringify({ source: "ETSY_DRAFT_IMPORT", previewId: saved.id, snapshot }) },
      update: { ...snapshot.listing, etsyListingId: target, status: "DRAFT_CREATED", printfulSyncProductId: null, lastDraftSyncAt: null,
        etsyConfigurationEvidenceJson: null, etsyDraftSettingsVerificationJson: null, lastVerifiedAt: new Date(),
        observationJson: JSON.stringify({ source: "ETSY_DRAFT_IMPORT", previewId: saved.id, snapshot }) } });
    if (previousListing?.etsyListingId !== target) await tx.spellmarkListingAsset.updateMany({ where: { listingId: listing.id }, data: { etsyRemoteId: null, etsySyncedAt: null } });
    await tx.spellmarkVariant.deleteMany({ where: { productId: imported.id, fulfillment: snapshot.fulfillment } });
    await tx.spellmarkVariant.createMany({ data: snapshot.variants.map(v => ({ productId: imported.id, fulfillment: snapshot.fulfillment,
      label: v.label, etsyListingId: target, etsyProductId: v.etsyProductId, etsySku: v.etsySku, retailPriceCents: v.retailPriceCents, currency: v.currency })) });
    const result = { state: "ETSY_DRAFT_IMPORTED", productId: imported.id, listingId: listing.id, etsyListingId: target,
      fulfillment: snapshot.fulfillment, variantCount: snapshot.variants.length, previewId: saved.id,
      supplierVerificationPending: snapshot.fulfillment === "PHYSICAL", visualVerificationPending: true,
      etsyMutated: false, printfulMutated: false, published: false, warnings: snapshot.warnings,
      nextAction: "Use get_product, attach_product_file (hero/mockup), inspect_etsy_listing_images, then owner-approved update_etsy_listing_image on this existing draft. No intake or draft creation is needed. Supplier configuration and publication remain separate." };
    await tx.spellmarkJournal.create({ data: { productId: imported.id, requestId: "etsy-draft-import:" + saved.id, kind: "ETSY_DRAFT_IMPORTED",
      bodyJson: JSON.stringify({ ...result, archive: snapshot.previous, approvedPreview: preview }) } });
    await tx.spellmarkDraftImportPreview.update({ where: { id: saved.id }, data: { appliedProductId: imported.id, resultJson: JSON.stringify(result) } });
    return result;
  }, { timeout: 90000, maxWait: 10000 });
}
