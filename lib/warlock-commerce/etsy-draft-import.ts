import * as z from "zod/v4";
import { bookkeepingFingerprint, canonicalBookkeepingFingerprint } from "./listing-observation.ts";
import { etsyListingType } from "./etsy-listing-type.ts";
import { hasRequiredEtsyAiDisclosure } from "./policy.ts";
import type { WarlockProductManifest } from "../warlock-mcp/manifest.ts";
import type { ListingLinkRead } from "./etsy-listing-link.ts";
const id = z.string().trim().min(1).max(100);
const remoteId = z.string().regex(/^[1-9]\d{0,18}$/);
export const draftImportPreviewShape = {
  etsyListingId: remoteId.describe("Existing owned Etsy draft or active listing to import. No new Etsy listing is created."),
  productId: id.nullable().describe("Existing canonical product to update, or null to create its canonical record from this listing."),
  expectedEtsyListingId: remoteId.nullable().describe("Exact currently saved ID for this fulfillment, or null if none. An old different ID must be freshly missing."),
  collection: z.string().max(200).optional().describe("Collection for a new canonical product; existing product metadata is preserved."),
};
export const draftImportApplyShape = { previewId: id, confirmImport: z.literal(true) };
export const draftImportPreviewSchema = z.strictObject(draftImportPreviewShape);
export const draftImportApplySchema = z.strictObject(draftImportApplyShape);
export type DraftImportInput = z.infer<typeof draftImportPreviewSchema>;
type Json = Record<string, unknown>;
const fail = (s: string): never => { throw Error("etsy_import_" + s); };
const obj = (v: unknown): Json => v && typeof v === "object" && !Array.isArray(v) ? v as Json : fail("invalid_response");
const rid = (v: unknown): string => remoteId.safeParse(String(v ?? "")).success && (typeof v !== "number" || Number.isSafeInteger(v)) ? String(v) : fail("invalid_id");
const text = (v: unknown, max: number) => typeof v === "string" && v.length <= max ? v : fail("invalid_copy");
const integer = (v: unknown, min: number, max = 2147483647): number => typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max ? v : fail("invalid_integer");
function money(v: unknown) {
  const p = obj(v), amount = integer(p.amount, 1), divisor = integer(p.divisor, 1);
  if (p.currency_code !== "USD" || !Number.isSafeInteger(amount * 100) || amount * 100 % divisor) fail("unsupported_price");
  return integer(amount * 100 / divisor, 1);
}
const optionalId = (v: unknown) => v == null || v === 0 ? null : rid(v);
export function importSource(product: WarlockProductManifest | null, input: DraftImportInput, fulfillment: "PHYSICAL" | "DIGITAL") {
  if (!input.productId) { if (product || input.expectedEtsyListingId) fail("source_identity_changed"); return null; }
  if (!product || product.id !== input.productId) return fail("product_missing");
  const selected = product.listings.filter(l => l.fulfillment === fulfillment);
  if (selected.length > 1 || (selected[0]?.etsyListingId ?? null) !== input.expectedEtsyListingId) fail("source_identity_changed");
  if (product.variants.some(v => v.fulfillment === fulfillment && v.etsyListingId && v.etsyListingId !== input.expectedEtsyListingId)) fail("variant_source_identity_changed");
  return selected[0] ?? null;
}
/** Import the remote variant set as itself; never infer Printful identities or match old variants by labels. */
export async function inspectDraftImport(product: WarlockProductManifest | null, input: DraftImportInput, shopId: number, read: ListingLinkRead) {
  const access = await read(`/shops/${shopId}/listings?state=draft&limit=1`);
  if (!Array.isArray(access.results) || !Number.isSafeInteger(access.count) || Number(access.count) < access.results.length ||
    (Number(access.count) > 0 && access.results.length !== 1) || access.results.some(v => rid(obj(v).shop_id) !== String(shopId))) fail("shop_access_not_verified");
  const remote = await read("/listings/" + input.etsyListingId);
  if (rid(remote.listing_id) !== input.etsyListingId || rid(remote.shop_id) !== String(shopId)) fail("ownership_mismatch");
  if (remote.state !== "draft" && remote.state !== "active") fail("state_unsupported");
  const remoteState = remote.state;
  const fulfillment = etsyListingType(remote) === "physical" ? "PHYSICAL" as const : "DIGITAL" as const;
  const source = importSource(product, input, fulfillment);
  if (input.expectedEtsyListingId && input.expectedEtsyListingId !== input.etsyListingId) {
    try { await read("/listings/" + input.expectedEtsyListingId); fail("source_still_exists"); }
    catch (e) { if (!(e instanceof Error) || e.message !== "etsy_http_404") throw e; }
  }
  const title = text(remote.title, 140); if (!title.trim()) fail("invalid_copy");
  const description = text(remote.description, 100000);
  if (!Array.isArray(remote.tags) || remote.tags.length > 13 || remote.tags.some(t => typeof t !== "string" || !t.trim() || t.length > 100)) fail("invalid_tags");
  const listing = { fulfillment, title, description, tagsJson: JSON.stringify(remote.tags),
    taxonomyId: integer(remote.taxonomy_id, 1), quantity: integer(remote.quantity, 0),
    whoMade: text(remote.who_made, 100), whenMade: text(remote.when_made, 100),
    isSupply: z.boolean().parse(remote.is_supply), shouldAutoRenew: z.boolean().parse(remote.should_auto_renew),
    shopSectionId: optionalId(remote.shop_section_id), productionPartnerId: fulfillment === "DIGITAL" ? null : source?.productionPartnerId ?? null,
    shippingProfileId: fulfillment === "PHYSICAL" ? optionalId(remote.shipping_profile_id) : null,
    readinessStateId: fulfillment === "PHYSICAL" ? optionalId(remote.readiness_state_id) : null,
    digitalDelivery: remote.when_made === "made_to_order" ? "MADE_TO_ORDER" : "INSTANT_DOWNLOAD",
  };
  let inventory: Json | null = null;
  let variants: Array<{ etsyProductId: string | null; etsySku: string | null; label: string; retailPriceCents: number; currency: string; quantity: number; enabled: boolean; values: unknown }>;
  if (fulfillment === "PHYSICAL") {
    inventory = await read(`/listings/${input.etsyListingId}/inventory?legacy=false`);
    if (!Array.isArray(inventory.products) || inventory.products.length > 500) fail("inventory_incomplete");
    const products = (inventory.products as unknown[]).map(obj).filter(p => p.is_deleted !== true);
    if (!products.length) fail("inventory_incomplete");
    variants = products.map(p => {
      const etsyProductId = rid(p.product_id);
      if (!Array.isArray(p.property_values) || p.property_values.length > 10 || !Array.isArray(p.offerings)) fail("inventory_incomplete");
      const offerings = (p.offerings as unknown[]).map(obj).filter(o => o.is_deleted !== true);
      if (offerings.length !== 1) fail("multiple_offerings_not_supported");
      const offering = offerings[0];
      const labels = (p.property_values as unknown[]).map(v => { const row = obj(v); rid(row.property_id);
        if (!Array.isArray(row.values) || row.values.some(s => typeof s !== "string" || s.length > 200)) fail("invalid_options");
        return (row.values as string[]).join(" / "); });
      const sku = p.sku == null ? "" : text(p.sku, 100);
      return { etsyProductId, etsySku: sku || null, label: labels.filter(Boolean).join(" / ") || sku || `Etsy variant ${etsyProductId}`,
        retailPriceCents: money(offering.price), currency: "USD", quantity: integer(offering.quantity, 0), enabled: z.boolean().parse(offering.is_enabled), values: p.property_values };
    });
    if (new Set(variants.map(v => v.etsyProductId)).size !== variants.length) fail("duplicate_inventory_identity");
  } else variants = [{ etsyProductId: null, etsySku: null, label: title, retailPriceCents: money(remote.price), currency: "USD", quantity: listing.quantity, enabled: true, values: [] }];
  const recheck = await read("/listings/" + input.etsyListingId);
  if (bookkeepingFingerprint(remote) !== bookkeepingFingerprint(recheck)) fail("remote_changed_retry");
  return { fulfillment, remoteState, listing, variants, observedAt: remote.last_modified_timestamp ?? null, remoteFingerprint: bookkeepingFingerprint({ remote, inventory }),
    previous: { listing: source, variants: product?.variants.filter(v => v.fulfillment === fulfillment) ?? [] },
    warnings: [...(!hasRequiredEtsyAiDisclosure(description) ? ["AI_DISCLOSURE_MISSING: imported copy is preserved; correct the listing through an approved edit."] : []),
      ...(fulfillment === "PHYSICAL" ? ["PRINTFUL_MAPPING_AND_QUOTES_PENDING: no old supplier identity is assigned to imported variants."] : []),
      "PRODUCTION_PARTNER_ETSY_ADS_AND_DIGITAL_CREATION_NOT_VERIFIED", "REMOTE_IMAGES_ARE_NOT_PRODUCT_OWNED_ASSETS", "VISUAL_REVIEW_PENDING"],
  };
}
export type DraftImportPreview = { version: 1; input: DraftImportInput; shopId: number; canonicalFingerprint: string | null; expiresAt: string; snapshot: Awaited<ReturnType<typeof inspectDraftImport>> };
export async function buildDraftImportPreview(product: WarlockProductManifest | null, input: DraftImportInput, shopId: number, read: ListingLinkRead): Promise<DraftImportPreview> {
  const snapshot = await inspectDraftImport(product, input, shopId, read);
  return { version: 1, input, shopId, canonicalFingerprint: product ? canonicalBookkeepingFingerprint(product) : null,
    expiresAt: new Date(Date.now() + 600000).toISOString(), snapshot };
}
export async function validateDraftImportPreview(product: WarlockProductManifest | null, preview: DraftImportPreview, shopId: number, read: ListingLinkRead) {
  if (preview.version !== 1 || !Number.isFinite(Date.parse(preview.expiresAt)) || Date.now() >= Date.parse(preview.expiresAt)) fail("preview_expired");
  if (shopId !== preview.shopId || (product ? canonicalBookkeepingFingerprint(product) : null) !== preview.canonicalFingerprint) fail("canonical_changed_retry");
  const snapshot = await inspectDraftImport(product, preview.input, shopId, read);
  if (bookkeepingFingerprint(snapshot) !== bookkeepingFingerprint(preview.snapshot)) fail("remote_changed_retry");
  if (Date.now() >= Date.parse(preview.expiresAt)) fail("preview_expired");
  return snapshot;
}
export function safeDraftImportError(e: unknown) {
  const s = e instanceof Error ? e.message : "";
  return /^(etsy_import_[a-z_]+|etsy_http_\d{3}|etsy_not_connected|etsy_shop_not_allowed|warlock_shop_id_missing|etsy_listing_type_[a-z_]+)$/.test(s) ? s : "etsy_import_failed";
}
