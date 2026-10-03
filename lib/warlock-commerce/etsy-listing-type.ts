/** Etsy uses type in requests and listing_type in listing responses. */
export function etsyListingType(remote: Record<string, unknown>) {
  const value = remote.listing_type ?? remote.type;
  if (remote.listing_type !== undefined && remote.type !== undefined && remote.listing_type !== remote.type) throw Error("etsy_listing_type_conflict");
  if (value !== "physical" && value !== "download") throw Error("etsy_listing_type_unknown");
  return value;
}
