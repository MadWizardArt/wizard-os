import type { PrismaClient } from "../app/generated/prisma/client";
import { intakeProductSchema } from "./warlock-intake-schema.ts";
import { readProduct, readVariant } from "./warlock-products.ts";
import { readListingManifest } from "./warlock-listings.ts";
import { ensureEtsyAiDisclosure } from "./warlock-commerce/policy.ts";
import { readIntakeBytes, materializeIntakeAsset, verifyIntakeAsset, discardIntakeBlob } from "./warlock-intake-assets.ts";

type Storage = { read: typeof readIntakeBytes; save: typeof materializeIntakeAsset; verify: typeof verifyIntakeAsset };
const storage: Storage = { read: readIntakeBytes, save: materializeIntakeAsset, verify: verifyIntakeAsset };

export async function intakeProduct(raw: unknown, db: PrismaClient, files: Storage = storage) {
  const input = intakeProductSchema.parse(raw);
  const product = readProduct(input.product);
  if (!product) throw new Error("invalid_product");
  const variants = input.variants ?? [];
  if (new Set(variants.map(v => `${v.fulfillment}:${v.label}`)).size !== variants.length) throw new Error("duplicate_variant_label");
  const requestedListings = input.listings ?? (input.listing ? [input.listing] : []);
  const suppliedFiles = new Map((input.files ?? []).map(file => [file.file_id, file]));
  if (suppliedFiles.size !== (input.files ?? []).length) throw new Error("duplicate_chatgpt_file_id");
  const referencedFiles = new Set<string>();
  const normalizedAssets = (input.assets ?? []).map(asset => {
    if (asset.assetId && /^(file[_-]|libfile_)/.test(asset.assetId)) {
      throw new Error("chatgpt_file_id_is_not_warlock_asset_id: Pass the attachment in top-level files and reference its file_id using assets.fileId.");
    }
    if (!asset.fileId) return asset;
    const file = suppliedFiles.get(asset.fileId);
    if (!file) throw new Error("chatgpt_file_input_missing: Supply the matching authorized file object in top-level files; a file ID alone cannot transfer bytes.");
    referencedFiles.add(file.file_id);
    const name = asset.name ?? file.file_name?.normalize("NFKD").replace(/[^A-Za-z0-9._-]/g, "_");
    if (!name) throw new Error("chatgpt_file_name_missing: Supply assets.name when ChatGPT omits file_name.");
    return { ...asset, fileId: undefined, url: file.download_url, name, contentType: asset.contentType ?? file.mime_type };
  });
  if ([...suppliedFiles.keys()].some(id => !referencedFiles.has(id))) throw new Error("chatgpt_file_role_missing: Reference every supplied file in assets with fileId and an explicit role.");
  const assetInputs = normalizedAssets.sort((a, b) => Number(b.role === "hero") - Number(a.role === "hero"));
  // Download and validate all bytes before mutating canonical state. Never log signed source URLs.
  const prepared: Array<Awaited<ReturnType<typeof readIntakeBytes>> | null> = [];
  let totalBytes = 0;
  const downloadDeadline = Date.now() + 60000;
  for (const asset of assetInputs) {
    if (Date.now() >= downloadDeadline) throw new Error("intake_download_budget_exceeded: Retry with smaller asset batches.");
    const data = asset.assetId ? null : await files.read(asset);
    totalBytes += data?.bytes.length ?? 0;
    if (totalBytes > 80 * 1024 * 1024) throw new Error("intake_package_too_large: Submit assets in batches of at most 80 MB.");
    prepared.push(data);
  }
  const createdBlobs: string[] = [];
  try {
  const result = await db.$transaction(async tx => {
    // Serialize title-based intake, including concurrent first creation and retries.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${product.title}))::text`;
    const matches = input.productId
      ? await tx.spellmarkProduct.findMany({ where: { id: input.productId }, include: { variants: true, listings: true } })
      : await tx.spellmarkProduct.findMany({ where: { title: product.title }, take: 2, include: { variants: true, listings: true } });
    if (input.productId && !matches.length) throw new Error("product_not_found");
    if (matches.length > 1) throw new Error("product_title_ambiguous: Use productId.");
    const existing = matches[0];
    if (existing && existing.title !== product.title) throw new Error("product_title_mismatch");
    // Intake completes preparation; changes after external execution require explicit reconciliation.
    if (existing?.listings.some(l => l.etsyListingId || l.printfulSyncProductId)) throw new Error("intake_locked_after_draft_execution");
    const saved = existing ?? await tx.spellmarkProduct.create({ data: product });
    const productId = saved.id;
    if (existing) {
      const updates = Object.fromEntries(Object.entries(input.product).filter(([key]) => key !== "title"));
      await tx.spellmarkProduct.update({ where: { id: productId }, data: updates });
    }
    const allVariants = [...(existing?.variants ?? [])];
    for (const variant of variants) {
      const matching = variant.variantId ? allVariants.filter(v => v.id === variant.variantId) : allVariants.filter(v => v.fulfillment === variant.fulfillment && v.label === variant.label);
      if (matching.length > 1) throw new Error("variant_label_ambiguous: Use variantId.");
      if (variant.variantId && !matching.length) throw new Error("variant_not_owned_by_product");
      const old = matching[0];
      if (old && old.fulfillment !== variant.fulfillment) throw new Error("variant_fulfillment_mismatch");
      const parsed = readVariant({ ...old, ...variant });
      if (!parsed) throw new Error("invalid_variant");
      const data = {
        ...parsed,
        ...(variant.retailPriceCents !== undefined ? { retailPriceCents: variant.retailPriceCents } : {}),
        ...(variant.productionBaseCents !== undefined ? { productionBaseCents: variant.productionBaseCents } : {}),
        ...(variant.productionQuotedAt !== undefined ? { productionQuotedAt: new Date(variant.productionQuotedAt) } : {}),
        ...(variant.currency !== undefined ? { currency: variant.currency } : {}),
      };
      const updated = old ? await tx.spellmarkVariant.update({ where: { id: old.id }, data }) : await tx.spellmarkVariant.create({ data: { ...data, productId } });
      if (old) allVariants.splice(allVariants.indexOf(old), 1, updated); else allVariants.push(updated);
    }
    if (allVariants.filter(v => v.fulfillment === "DIGITAL").length > 1) throw new Error("digital_variations_not_supported");
    const fulfillments = [...new Set(allVariants.map(v => v.fulfillment))];
    const listingFulfillments = new Set<string>();
    for (const draft of requestedListings) {
      const fulfillment = draft.fulfillment ?? (draft.listingType ? (draft.listingType === "physical" ? "PHYSICAL" : "DIGITAL") : fulfillments.length === 1 ? fulfillments[0] : undefined);
      if (!fulfillment) throw new Error("listing_fulfillment_required");
      if (draft.listingType && (draft.listingType === "physical") !== (fulfillment === "PHYSICAL")) throw new Error("listing_fulfillment_mismatch");
      if (!fulfillments.includes(fulfillment)) throw new Error("listing_variant_missing");
      if (listingFulfillments.has(fulfillment)) throw new Error("duplicate_listing_fulfillment");
      listingFulfillments.add(fulfillment);
      const old = existing?.listings.find(l => l.fulfillment === fulfillment);
      const parsed = readListingManifest({ ...old, ...draft, fulfillment, title: draft.title ?? old?.title ?? product.title,
        whenMade: draft.digitalDelivery !== undefined ? (draft.digitalDelivery === "MADE_TO_ORDER" ? "made_to_order" : "2020_2026") : old?.whenMade,
        tags: draft.tags ?? (old ? JSON.parse(old.tagsJson) : []),
        description: ensureEtsyAiDisclosure(draft.description ?? old?.description ?? product.description), status: "CONFIG" });
      if (!parsed) throw new Error("invalid_listing_manifest");
      // IDs supplied by intake stay CONFIG until configure_etsy_listing verifies them live.
      const { tags, ...fields } = parsed;
      await tx.spellmarkListing.upsert({ where: { productId_fulfillment: { productId, fulfillment } },
        create: { ...fields, productId, tagsJson: JSON.stringify(tags) }, update: { ...fields, tagsJson: JSON.stringify(tags) } });
      const price = draft.launchPrice ?? draft.price;
      if (price !== undefined) {
        const cents = Math.round(price * 100);
        const targets = allVariants.filter(v => v.fulfillment === fulfillment);
        if (targets.length > 1 && targets.some(t => !variants.some(v => v.fulfillment === fulfillment && v.label === t.label && v.retailPriceCents !== undefined))) throw new Error("per_variant_price_required: Supply retailPriceCents for each physical edition instead of a listing price.");
        if (targets.length === 1 && !variants.some(v => v.fulfillment === fulfillment && v.retailPriceCents !== undefined)) {
          await tx.spellmarkVariant.update({ where: { id: targets[0].id }, data: { retailPriceCents: cents } });
        }
      }
    }
    const listings = await tx.spellmarkListing.findMany({ where: { productId }, include: { assets: true } });
    if (listings.some(l => l.digitalDelivery === "MADE_TO_ORDER" && l.assets.some(a => a.kind === "customer_file"))) throw new Error("made_to_order_cannot_have_listing_downloads");
    for (let index = 0; index < assetInputs.length; index++) {
      const inputAsset = assetInputs[index];
      let asset;
      if (inputAsset.assetId) {
        asset = await tx.spellmarkAsset.findFirst({ where: { id: inputAsset.assetId, productId } });
        if (!asset) throw new Error("asset_not_owned_by_product: assetId must identify an existing canonical asset belonging to this product. For new ChatGPT files, use files plus assets.fileId.");
        if (asset.role !== inputAsset.role) throw new Error("asset_role_mismatch");
        await files.verify(asset);
      } else {
        const data = prepared[index]!;
        const pathname = `warlock/${productId}/intake/${inputAsset.role}/${data.digest}/${inputAsset.name}`;
        asset = await tx.spellmarkAsset.findFirst({ where: { productId, pathname } });
        if (asset) await files.verify(asset);
        else {
          const stored = await files.save(productId, inputAsset, data);
          createdBlobs.push(stored.blobUrl);
          asset = await tx.spellmarkAsset.create({ data: { ...stored, productId } });
        }
      }
      const kind = inputAsset.role === "hero" || inputAsset.role === "mockup" ? "image" : inputAsset.role === "customer_file" ? "customer_file" : null;
      if (!kind) continue;
      const targets = listings.filter(l => (!inputAsset.fulfillment || l.fulfillment === inputAsset.fulfillment) && (kind !== "customer_file" || l.fulfillment === "DIGITAL"));
      if (!targets.length) throw new Error("asset_listing_missing");
      for (const listing of targets) {
        if (kind === "customer_file" && listing.digitalDelivery === "MADE_TO_ORDER") throw new Error("made_to_order_cannot_have_listing_downloads");
        const links = await tx.spellmarkListingAsset.findMany({ where: { listingId: listing.id, kind } });
        const already = links.find(l => l.assetId === asset.id);
        const position = inputAsset.position ?? already?.position ?? (Math.max(0, ...links.map(l => l.position)) + 1);
        if (position > (kind === "customer_file" ? 5 : 20)) throw new Error("listing_asset_limit_exceeded");
        if (already) {
          if (already.position !== position) throw new Error("asset_position_change_requires_review");
          continue;
        }
        const occupied = links.find(l => l.position === position);
        if (inputAsset.expectedAssetId !== undefined) {
          if (!occupied || occupied.assetId !== inputAsset.expectedAssetId) throw new Error("customer_file_replacement_stale");
          if (occupied.etsyRemoteId || occupied.etsySyncedAt) throw new Error("customer_file_replacement_requires_etsy_reconciliation");
          await tx.spellmarkListingAsset.update({ where: { id: occupied.id }, data: { assetId: asset.id } });
          await tx.spellmarkJournal.create({ data: { productId, requestId: `customer-file-replacement:${crypto.randomUUID()}`, kind: "CUSTOMER_FILE_REPLACEMENT",
            bodyJson: JSON.stringify({ listingId: listing.id, position, previousAssetId: inputAsset.expectedAssetId, assetId: asset.id, etsyMutated: false }) } });
          continue;
        }
        if (occupied) throw new Error("asset_position_conflict: For an approved pre-draft customer-file replacement, supply expectedAssetId, DIGITAL fulfillment, position and confirmReplacement:true.");
        await tx.spellmarkListingAsset.create({ data: { listingId: listing.id, assetId: asset.id, kind, position } });
      }
    }
    return { intake: existing ? "completed" : "accepted", productId, title: saved.title,
      variantCount: allVariants.length, listingCount: listings.length,
      assetCount: await tx.spellmarkAsset.count({ where: { productId } }),
      nextAction: "Retrieve and validate the canonical package; inspect and verify Etsy configuration, evaluate gates, preflight supplier, and prepare execution before authorized draft write." };
  }, { timeout: 60000, maxWait: 10000 });
  return result;
  } catch (error) {
    // Only clean up bytes created by this attempt after the DB transaction rolled back.
    // If ownership cannot be checked, retain the blob rather than risk deleting a live file.
    if (files === storage && createdBlobs.length) {
      try {
        await db.$transaction(async tx => {
          // Serialize cleanup with retries so it cannot remove a concurrently adopted blob.
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${product.title}))::text`;
          for (const blobUrl of createdBlobs) {
            const live = await tx.spellmarkAsset.findUnique({ where: { blobUrl }, select: { id: true } });
            if (!live) await discardIntakeBlob(blobUrl);
          }
        }, { timeout: 30000 });
      } catch { /* Retain bytes if safe ownership verification is unavailable. */ }
    }
    throw error;
  }
}
