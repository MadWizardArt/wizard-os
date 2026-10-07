import * as z from "zod/v4";
import type { WarlockProductManifest } from "../warlock-mcp/manifest.ts";
import { canonicalBookkeepingFingerprint, bookkeepingFingerprint } from "./listing-observation.ts";
import { etsyListingType } from "./etsy-listing-type.ts";
import { etsySkuForVariant } from "./etsy-inventory.ts";
import { etsySettingId } from "./etsy-draft-settings.ts";

const id = z.string().trim().min(1).max(100);
const remoteId = z.string().regex(/^[1-9]\d{0,18}$/);
export const listingLinkPreviewShape = {
  productId: id, fulfillment: z.enum(["PHYSICAL", "DIGITAL"]),
  expectedEtsyListingId: remoteId.nullable().describe("Exact currently saved Etsy ID; null only when no listing is linked."),
  targetEtsyListingId: remoteId.nullable().describe("Existing replacement draft ID, or null to clear a missing Etsy link only. Never creates or deletes anything in Etsy."),
  expectedTargetTitle: z.string().min(1).max(140).optional().describe("Exact observed Etsy draft title when it differs from canonical copy. Explicitly review both titles in the saved preview; canonical title is preserved."),
  variantMappings: z.array(z.object({ variantId: id, etsyProductId: remoteId })).max(50).optional()
    .describe("Explicit complete physical inventory mapping. Omit only when every canonical SKU matches exactly and uniquely. Review color/size values in the preview."),
};
export const listingLinkApplyShape = { productId: id, previewId: id, confirmListingLink: z.literal(true) };
export const listingLinkPreviewSchema = z.strictObject(listingLinkPreviewShape);
export const listingLinkApplySchema = z.strictObject(listingLinkApplyShape);
export type ListingLinkInput = z.infer<typeof listingLinkPreviewSchema>;
type Json = Record<string, unknown>;
export type ListingLinkRead = (path: string) => Promise<Json>;
const fail = (code: string): never => { throw Error("etsy_link_" + code); };
const object = (v: unknown): Json => v && typeof v === "object" && !Array.isArray(v) ? v as Json : fail("invalid_response");
const remote = (v: unknown) => etsySettingId(v) ?? fail("invalid_remote_id");
const money = (value: unknown) => {
  const p = object(value);
  if (p.currency_code !== "USD" || !Number.isSafeInteger(p.amount) || Number(p.amount) <= 0 ||
      !Number.isSafeInteger(p.divisor) || Number(p.divisor) <= 0 ||
      !Number.isSafeInteger(Number(p.amount) * 100) || Number(p.amount) * 100 % Number(p.divisor) !== 0) fail("invalid_price");
  return Number(p.amount) * 100 / Number(p.divisor);
};

export function linkListing(manifest: WarlockProductManifest, input: ListingLinkInput) {
  const listings = manifest.listings.filter(l => l.fulfillment === input.fulfillment);
  if (listings.length !== 1 || listings[0].etsyListingId !== input.expectedEtsyListingId) fail("source_identity_changed");
  if (!input.targetEtsyListingId && input.expectedTargetTitle !== undefined) fail("title_review_requires_target");
  if (input.targetEtsyListingId === input.expectedEtsyListingId) fail("different_target_required");
  const variants = manifest.variants.filter(v => v.fulfillment === input.fulfillment);
  if (!variants.length || variants.some(v => v.etsyListingId && v.etsyListingId !== input.expectedEtsyListingId)) fail("variant_source_identity_changed");
  if (input.fulfillment === "DIGITAL" && (variants.length !== 1 || input.variantMappings?.length)) fail("digital_mapping_invalid");
  return { listing: listings[0], variants };
}

/** Probe authenticated listing-read access before treating a listing 404 as missing. */
export async function inspectListingLink(
  manifest: WarlockProductManifest, input: ListingLinkInput, shopId: number, read: ListingLinkRead,
) {
  const { listing, variants } = linkListing(manifest, input);
  const access = await read(`/shops/${shopId}/listings?state=draft&limit=1`);
  if (!Array.isArray(access.results) || !Number.isSafeInteger(access.count) || Number(access.count) < 0 || Number(access.count) < access.results.length ||
      (Number(access.count) > 0 && access.results.length !== 1) || access.results.some(value => remote(object(value).shop_id) !== String(shopId))) fail("shop_access_not_verified");
  if (input.expectedEtsyListingId) {
    try { await read("/listings/" + input.expectedEtsyListingId); fail("source_still_exists"); }
    catch (error) { if (!(error instanceof Error) || error.message !== "etsy_http_404") throw error; }
  }
  if (!input.targetEtsyListingId) return {
    mode: "CLEAR_MISSING_LINK" as const, source: { etsyListingId: input.expectedEtsyListingId, status: "NOT_FOUND" },
    target: null, mappings: [], unmappedVariants: [],
  };
  const targetId = input.targetEtsyListingId, target = await read("/listings/" + targetId);
  if (remote(target.listing_id) !== targetId || remote(target.shop_id) !== String(shopId)) fail("target_ownership_mismatch");
  if (target.state !== "draft") fail("target_not_draft");
  if (etsyListingType(target) !== (input.fulfillment === "DIGITAL" ? "download" : "physical")) fail("target_type_mismatch");
  if (typeof target.title !== "string" || !target.title.trim()) fail("invalid_response");
  if (input.expectedTargetTitle !== undefined && target.title !== input.expectedTargetTitle) fail("target_title_changed");
  if (target.title !== listing.title && input.expectedTargetTitle === undefined) fail("target_title_mismatch");
  if (!listing.taxonomyId || Number(target.taxonomy_id) !== listing.taxonomyId) fail("target_taxonomy_mismatch");
  if (input.fulfillment === "DIGITAL" && (target.when_made === "made_to_order") !== (listing.digitalDelivery === "MADE_TO_ORDER")) fail("target_delivery_mismatch");
  if (input.fulfillment === "DIGITAL" && money(target.price) !== variants[0].retailPriceCents) fail("target_price_mismatch");
  let inventory: Json[] = [];
  let mappings: Array<{ variantId: string; canonicalLabel: string; etsyProductId: string; sku: string; values: unknown; retailPriceCents: number }> = [];
  let unmappedVariants: string[] = [];
  if (input.fulfillment === "PHYSICAL") {
    const payload = await read("/listings/" + targetId + "/inventory?legacy=false");
    if (!Array.isArray(payload.products)) fail("incomplete_inventory");
    inventory = (payload.products as unknown[]).map(object).filter(p => p.is_deleted !== true);
    if (inventory.length !== variants.length || new Set(inventory.map(p => remote(p.product_id))).size !== inventory.length) fail("inventory_variant_set_mismatch");
    const explicit = input.variantMappings;
    if (explicit && (explicit.length !== variants.length || new Set(explicit.map(m => m.variantId)).size !== variants.length ||
      new Set(explicit.map(m => m.etsyProductId)).size !== variants.length || explicit.some(m => !variants.some(v => v.id === m.variantId)))) fail("complete_mapping_required");
    mappings = variants.flatMap(v => {
      const chosen = explicit?.find(m => m.variantId === v.id);
      const candidates = inventory.filter(p => chosen ? remote(p.product_id) === chosen.etsyProductId :
        typeof p.sku === "string" && p.sku.trim() === etsySkuForVariant(v));
      if (candidates.length !== 1) { unmappedVariants.push(v.id); return []; }
      const p = candidates[0];
      if (typeof p.sku !== "string" || !p.sku.trim() || p.sku.length > 32) fail("inventory_sku_required");
      if (!Array.isArray(p.offerings) || p.offerings.length !== 1 || !Array.isArray(p.property_values)) fail("incomplete_inventory");
      const offering = object((p.offerings as unknown[])[0]);
      if (offering.is_deleted === true || offering.is_enabled !== true || !Number.isSafeInteger(offering.quantity) || Number(offering.quantity) < 1) fail("inventory_offering_invalid");
      if (money(offering.price) !== v.retailPriceCents) fail("target_price_mismatch");
      return [{ variantId: v.id, canonicalLabel: v.label, etsyProductId: remote(p.product_id), sku: String(p.sku),
        values: p.property_values, retailPriceCents: money(offering.price) }];
    });
    if (new Set(mappings.map(m => m.etsyProductId)).size !== mappings.length || new Set(inventory.map(p => String(p.sku).trim())).size !== inventory.length) fail("inventory_mapping_ambiguous");
    if (explicit && unmappedVariants.length) fail("mapping_not_observed");
  }
  // Check the target again after inventory inspection; signatures include all read listing metadata.
  const rechecked = await read("/listings/" + targetId);
  if (bookkeepingFingerprint(target) !== bookkeepingFingerprint(rechecked)) fail("target_changed_retry");
  return { mode: "LINK_EXISTING_DRAFT" as const,
    source: { etsyListingId: input.expectedEtsyListingId, status: input.expectedEtsyListingId ? "NOT_FOUND" : "UNLINKED" },
    target: { etsyListingId: targetId, shopId: String(shopId), state: "draft", title: target.title, canonicalTitle: listing.title,
      titleDifferenceReviewed: target.title !== listing.title, canonicalTitlePreserved: true,
      taxonomyId: listing.taxonomyId, listingFingerprint: bookkeepingFingerprint(target),
      inventoryFingerprint: bookkeepingFingerprint(inventory),
      observedInventory: inventory.map(p => ({ etsyProductId: remote(p.product_id), sku: p.sku, values: p.property_values, offerings: p.offerings })),
    }, mappings, unmappedVariants,
  };
}

export type ListingLinkPreview = {
  schemaVersion: 1; input: ListingLinkInput; productFingerprint: string; shopId: number;
  checkedAt: string; expiresAt: string; snapshot: Awaited<ReturnType<typeof inspectListingLink>>;
};
export async function buildListingLinkPreview(manifest: WarlockProductManifest, input: ListingLinkInput, shopId: number, read: ListingLinkRead) {
  const snapshot = await inspectListingLink(manifest, input, shopId, read);
  if (snapshot.unmappedVariants.length) return { state: "NEEDS_VARIANT_MAPPING" as const, snapshot,
    canonicalVariants: manifest.variants.filter(v => v.fulfillment === input.fulfillment).map(v => ({ variantId: v.id, label: v.label, retailPriceCents: v.retailPriceCents })),
    nextAction: "Review the target inventory's colors/sizes and provide a complete explicit variantMappings selection. Price or label similarity is not an automatic match." };
  const now = new Date();
  const preview: ListingLinkPreview = { schemaVersion: 1, input, productFingerprint: canonicalBookkeepingFingerprint(manifest),
    shopId, checkedAt: now.toISOString(), expiresAt: new Date(now.getTime() + 10 * 60_000).toISOString(), snapshot };
  return { state: "PREVIEW_READY" as const, preview };
}
export async function validateListingLinkPreview(manifest: WarlockProductManifest, preview: ListingLinkPreview, shopId: number, read: ListingLinkRead) {
  if (preview.schemaVersion !== 1 || !Number.isFinite(Date.parse(preview.expiresAt)) || Date.now() >= Date.parse(preview.expiresAt)) fail("preview_expired");
  if (preview.shopId !== shopId) fail("shop_changed");
  if (canonicalBookkeepingFingerprint(manifest) !== preview.productFingerprint) fail("canonical_changed_retry");
  const snapshot = await inspectListingLink(manifest, preview.input, shopId, read);
  if (bookkeepingFingerprint(snapshot) !== bookkeepingFingerprint(preview.snapshot)) fail("snapshot_changed_fresh_preview_required");
  return snapshot;
}
export function safeListingLinkError(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  return /^(etsy_link_[a-z_]+|etsy_http_\d{3}|etsy_invalid_response|etsy_not_connected|etsy_shop_not_allowed|warlock_shop_id_missing|etsy_listing_type_[a-z_]+)$/.test(code)
    ? code : "etsy_link_request_failed";
}
