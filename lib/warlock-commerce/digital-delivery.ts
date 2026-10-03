import { etsyListingType } from "./etsy-listing-type.ts";
import type { WarlockManifestListing } from "../warlock-mcp/manifest.ts";

export function digitalWhenMade(listing: WarlockManifestListing) {
  if (listing.fulfillment !== "DIGITAL") return listing.whenMade;
  const custom = listing.digitalDelivery === "MADE_TO_ORDER";
  if (custom !== (listing.whenMade === "made_to_order")) throw Error("digital_delivery_mode_mismatch");
  if (custom && listing.assets.some(a => a.kind === "customer_file")) throw Error("made_to_order_cannot_have_listing_downloads");
  return custom ? "made_to_order" : listing.whenMade;
}

export function assertEditableDraft(listing: WarlockManifestListing, remote: Record<string, unknown>, shopId: number) {
  if (String(remote.listing_id) !== listing.etsyListingId || String(remote.shop_id) !== String(shopId)) throw Error("etsy_listing_ownership_mismatch");
  if (remote.state !== "draft") throw Error("etsy_listing_not_draft");
  if (etsyListingType(remote) !== (listing.fulfillment === "DIGITAL" ? "download" : "physical")) throw Error("etsy_listing_type_mismatch");
  if (listing.fulfillment === "DIGITAL" && (remote.when_made === "made_to_order") !== (listing.digitalDelivery === "MADE_TO_ORDER")) throw Error("delivery_mode_locked_after_draft_execution");
}
