import type {
  WarlockManifestListing,
  WarlockManifestVariant,
} from "../warlock-mcp/manifest.ts";

export const ETSY_EDITION_PROPERTY_ID = 513;
export const ETSY_EDITION_PROPERTY_NAME = "Edition";

export function etsySkuForVariant(variant: WarlockManifestVariant) {
  if (variant.etsySku?.trim()) return variant.etsySku.trim();
  const compact = variant.id.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return ("SM-" + compact).slice(0, 32);
}

export function moneyFromCents(cents: number) {
  return (cents / 100).toFixed(2);
}

export function buildPhysicalInventoryBody(
  listing: WarlockManifestListing,
  variants: WarlockManifestVariant[],
) {
  if (!listing.readinessStateId) throw new Error("readiness_state_missing");
  if (!variants.length) throw new Error("physical_variants_missing");

  return {
    products: variants.map((variant) => {
      if (!variant.retailPriceCents) throw new Error("physical_price_missing");
      return {
        sku: etsySkuForVariant(variant),
        offerings: [{
          quantity: listing.quantity,
          price: variant.retailPriceCents / 100,
          is_enabled: true,
          readiness_state_id: listing.readinessStateId,
        }],
        property_values: [{
          property_id: ETSY_EDITION_PROPERTY_ID,
          property_name: ETSY_EDITION_PROPERTY_NAME,
          scale_id: null,
          value_ids: [],
          values: [variant.label],
        }],
      };
    }),
    price_on_property: [ETSY_EDITION_PROPERTY_ID],
    quantity_on_property: [],
    sku_on_property: [ETSY_EDITION_PROPERTY_ID],
    readiness_state_on_property: [],
  };
}
