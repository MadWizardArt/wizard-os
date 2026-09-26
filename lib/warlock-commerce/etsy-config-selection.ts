import type { WarlockManifestListing } from "../warlock-mcp/manifest.ts";

export type EtsyConfigurationSelection = {
  fulfillment: "DIGITAL" | "PHYSICAL";
  taxonomyId: number;
  shippingProfileId?: string;
  readinessStateId?: string;
};

export function validateEtsyConfigurationSelection(
  selection: EtsyConfigurationSelection,
) {
  const errors: string[] = [];
  const positive = (value: unknown) =>
    Number.isSafeInteger(value) && Number(value) > 0;
  const external = (value: unknown) =>
    typeof value === "string" && /^[1-9]\d{0,18}$/.test(value);

  if (!positive(selection.taxonomyId)) errors.push("taxonomy_id_invalid");

  if (selection.fulfillment === "PHYSICAL") {
    if (!external(selection.shippingProfileId)) errors.push("shipping_profile_id_required");
    if (!external(selection.readinessStateId)) errors.push("readiness_state_id_required");
  } else {
    if (selection.shippingProfileId !== undefined) errors.push("digital_shipping_profile_not_allowed");
    if (selection.readinessStateId !== undefined) errors.push("digital_readiness_state_not_allowed");
  }

  return errors;
}

export function listingConfigurationBlockers(
  listing: WarlockManifestListing,
  selection: EtsyConfigurationSelection,
) {
  const blockers: string[] = [];
  if (!listing.title.trim()) blockers.push("listing_title_missing");
  if (!selection.taxonomyId) blockers.push("listing_taxonomy_missing");

  const imageCount = listing.assets.filter((link) => link.kind === "image").length;
  if (imageCount === 0) blockers.push("listing_images_missing");

  if (selection.fulfillment === "PHYSICAL") {
    if (!selection.shippingProfileId) blockers.push("shipping_profile_missing");
    if (!selection.readinessStateId) blockers.push("readiness_state_missing");
  } else {
    const customerFiles = listing.assets.filter((link) => link.kind === "customer_file");
    if (customerFiles.length === 0) blockers.push("digital_customer_files_missing");
  }

  return blockers;
}

export function configuredListingStatus(
  listing: WarlockManifestListing,
  blockers: string[],
) {
  if (listing.status === "SYNCED" || listing.status === "WAITING_PRINTFUL") {
    return listing.status;
  }
  if (listing.etsyListingId) return "DRAFT_CREATED";
  return blockers.length === 0 ? "READY" : "CONFIG";
}
