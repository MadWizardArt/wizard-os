import type { WarlockManifestListing, WarlockProductManifest } from "../warlock-mcp/manifest.ts";
import { ETSY_AI_DISCLOSURE } from "./policy.ts";

// These are Warlock intent values, not an undocumented Etsy API enumeration.
export const DIGITAL_CREATION_INTENT = "AI_ASSISTED_DIGITAL_DESIGN";
export const ETSY_DRAFT_CAPABILITIES = {
  checkedAt: "2026-10-07",
  source: "https://www.etsy.com/openapi/generated/oas/3.0.0.json",
  shopSection: { write: true, readback: true },
  productionPartner: { write: true, readback: false },
  digitalContentCreation: { write: false, readback: false },
  etsyAds: { write: false, readback: false },
} as const;

export type EtsyDraftSettings = {
  shopSectionId?: string | null;
  productionPartnerId?: string | null;
  digitalContentCreationType?: string | null;
  etsyAdsEnabled?: boolean;
};

export function etsySettingId(value: unknown): string | null {
  if (typeof value === "number" && !Number.isSafeInteger(value)) return null;
  if (typeof value !== "number" && typeof value !== "string") return null;
  const id = String(value);
  return /^[1-9]\d{0,18}$/.test(id) && BigInt(id) <= BigInt("9223372036854775807") ? id : null;
}

export function draftSettingsBlockers(listing: EtsyDraftSettings & { fulfillment: string }) {
  const errors: string[] = [];
  if (!etsySettingId(listing.shopSectionId)) errors.push("shop_section_configuration_required");
  if (listing.etsyAdsEnabled !== undefined && typeof listing.etsyAdsEnabled !== "boolean") errors.push("etsy_ads_intent_invalid");
  if (listing.fulfillment === "DIGITAL") {
    if (listing.productionPartnerId != null) errors.push("digital_production_partner_not_allowed");
    if (listing.digitalContentCreationType !== DIGITAL_CREATION_INTENT) errors.push("digital_creation_intent_required");
  } else {
    if (!etsySettingId(listing.productionPartnerId)) errors.push("production_partner_configuration_required");
    if (listing.digitalContentCreationType != null) errors.push("physical_digital_creation_not_allowed");
  }
  return errors;
}

export function draftSettingsManualActions(listing: EtsyDraftSettings & { fulfillment: string }) {
  return [
    { code: "MANUAL_ETSY_ADS_ACTION_REQUIRED", intendedEnabled: listing.etsyAdsEnabled ?? true,
      reason: "Etsy Open API does not expose Ads enrollment or its current state. Check this listing in Etsy; canonical intent is not remote activation." },
    ...(listing.fulfillment === "DIGITAL" ? [{ code: "MANUAL_DIGITAL_CONTENT_CREATION_ACTION_REQUIRED",
      intendedCreationType: listing.digitalContentCreationType ?? DIGITAL_CREATION_INTENT,
      reason: "Select the Etsy editor option accurately describing AI-assisted digital design. The current API has no field or enumeration for this control." }] : []),
    { code: "MANUAL_PRODUCTION_PARTNER_VERIFICATION_REQUIRED", intendedPartnerId: listing.productionPartnerId ?? null,
      reason: "The API accepts production_partner_ids but its listing response does not expose assignment. Verify Printful for physical listings and no partner for digital listings in Etsy." },
  ];
}

export function appendDraftSettings(form: URLSearchParams, listing: WarlockManifestListing) {
  const errors = draftSettingsBlockers(listing);
  if (errors.length) throw new Error("etsy_draft_settings_incomplete:" + errors.join(","));
  form.set("shop_section_id", listing.shopSectionId!);
  // Empty array serialization clears an existing digital draft's partner; never reuse a physical partner.
  form.set("production_partner_ids", listing.fulfillment === "PHYSICAL" ? listing.productionPartnerId! : "");
  // Unsupported controls deliberately never become outbound Etsy fields.
}

type Json = Record<string, unknown>;
type ReadEtsy = (path: string) => Promise<Json>;
const rows = (payload: Json) => Array.isArray(payload.results)
  ? payload.results.filter((row): row is Json => !!row && typeof row === "object") : [];

export async function verifyDraftSettingsIds(
  manifest: WarlockProductManifest, listing: WarlockManifestListing, shopId: number, read: ReadEtsy,
) {
  const errors = draftSettingsBlockers(listing);
  if (errors.length) throw new Error("etsy_draft_settings_incomplete:" + errors.join(","));
  const section = await read(`/shops/${shopId}/sections/${listing.shopSectionId}`);
  if (etsySettingId(section.shop_section_id) !== listing.shopSectionId) throw new Error("etsy_shop_section_mismatch");
  let partner: Json | null = null;
  if (listing.fulfillment === "PHYSICAL") {
    const variants = manifest.variants.filter(v => v.fulfillment === "PHYSICAL");
    if (!variants.length || variants.some(v => !v.printfulProductId || !v.printfulVariantId || !v.printfulStoreId)) {
      throw new Error("explicit_fulfillment_supplier_configuration_required");
    }
    const partners = rows(await read(`/shops/${shopId}/production-partners`));
    partner = partners.find(p => etsySettingId(p.production_partner_id) === listing.productionPartnerId) ?? null;
    if (!partner) throw new Error("etsy_production_partner_not_found");
    if (typeof partner.partner_name !== "string" || partner.partner_name.trim().toLowerCase() !== "printful") {
      throw new Error("etsy_production_partner_not_printful");
    }
  }
  return { shopId, section: { id: listing.shopSectionId, title: section.title ?? null },
    productionPartner: partner ? { id: listing.productionPartnerId, name: partner.partner_name } : null,
    verifiedAt: new Date().toISOString() };
}

export function observeDraftSettings(listing: WarlockManifestListing, payload: Json, shopId: number) {
  const discrepancies: string[] = [];
  if (etsySettingId(payload.shop_id) !== String(shopId)) discrepancies.push("etsy_listing_shop_mismatch");
  if (String(payload.listing_id ?? "") !== listing.etsyListingId) discrepancies.push("etsy_listing_identity_mismatch");
  if (payload.state !== "draft") discrepancies.push("etsy_listing_not_draft");
  if (etsySettingId(payload.shop_section_id) !== listing.shopSectionId) discrepancies.push("etsy_shop_section_mismatch");
  if (Number(payload.taxonomy_id) !== listing.taxonomyId) discrepancies.push("etsy_taxonomy_mismatch");
  if (typeof payload.description !== "string" || !payload.description.includes(ETSY_AI_DISCLOSURE)) discrepancies.push("etsy_required_disclosure_missing");
  return { verifiedAt: new Date().toISOString(), listingId: listing.etsyListingId,
    intended: { shopSectionId: listing.shopSectionId, productionPartnerId: listing.productionPartnerId ?? null,
      digitalContentCreationType: listing.digitalContentCreationType ?? null, etsyAdsEnabled: listing.etsyAdsEnabled ?? true },
    observed: { shopId: payload.shop_id ?? null, state: payload.state ?? null,
      shopSectionId: payload.shop_section_id ?? null, taxonomyId: payload.taxonomy_id ?? null,
      disclosurePresent: typeof payload.description === "string" && payload.description.includes(ETSY_AI_DISCLOSURE) },
    supportedSettingsVerified: discrepancies.length === 0, fullyConfigured: false as const,
    discrepancies, manualActions: draftSettingsManualActions(listing), capabilities: ETSY_DRAFT_CAPABILITIES };
}
