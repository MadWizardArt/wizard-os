import { createHash } from "node:crypto";
import type { WarlockProductManifest, WarlockManifestListing } from "../warlock-mcp/manifest.ts";
import { hasRequiredEtsyAiDisclosure } from "./policy.ts";

type Json = Record<string, unknown>;
export type AssetMapping = { linkId: string; expectedRemoteId: string | null; remoteId: string };
export function bookkeepingFingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
export function canonicalBookkeepingFingerprint(product: WarlockProductManifest) {
  return bookkeepingFingerprint({ ...product, listings: product.listings.map(({ lastVerifiedAt, observationJson, ...l }) => l) });
}
export function listingEvidenceFingerprint(
  listing: { id:string;fulfillment:string;title:string;description:string;whenMade:string;digitalDelivery?:string;etsyListingId:string|null;assets:Array<{id:string;kind:string;position:number;etsyRemoteId:string|null}> },
  variants: Array<{id:string;fulfillment:string;retailPriceCents:number|null;currency:string}>,
) {
  return bookkeepingFingerprint({ id:listing.id,fulfillment:listing.fulfillment,title:listing.title,description:listing.description,
    whenMade:listing.whenMade,digitalDelivery:listing.digitalDelivery ?? "INSTANT_DOWNLOAD",etsyListingId:listing.etsyListingId,
    assets:listing.assets.map(a=>({id:a.id,kind:a.kind,position:a.position,etsyRemoteId:a.etsyRemoteId})).sort((a,b)=>a.id.localeCompare(b.id)),
    prices:variants.filter(v=>v.fulfillment===listing.fulfillment).map(v=>({id:v.id,retailPriceCents:v.retailPriceCents,currency:v.currency})).sort((a,b)=>a.id.localeCompare(b.id)) });
}

function object(value: unknown): Json {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("bookkeeping_invalid_etsy_response");
  return value as Json;
}
function id(value: unknown) {
  const text = typeof value === "number" && !Number.isSafeInteger(value) ? "" : String(value ?? "");
  if (!/^[1-9]\d{0,18}$/.test(text)) throw Error("bookkeeping_invalid_remote_id");
  return text;
}
function money(value: unknown) {
  const p = object(value);
  if (p.currency_code !== "USD" || typeof p.amount !== "number" || !Number.isSafeInteger(p.amount) || p.amount < 0 || typeof p.divisor !== "number" || !Number.isSafeInteger(p.divisor) || p.divisor <= 0 || !Number.isSafeInteger(p.amount * 100) || (p.amount * 100) % p.divisor !== 0) throw Error("bookkeeping_invalid_etsy_price");
  return p.amount * 100 / p.divisor;
}
function collection(payload: Json, kind: "image" | "customer_file", listingId: string) {
  if (!Array.isArray(payload.results) || !Number.isSafeInteger(payload.count) || payload.count !== payload.results.length || payload.results.length > 20) throw Error("bookkeeping_incomplete_remote_assets");
  const result = payload.results.map(value => {
    const row = object(value);
    if (row.listing_id !== undefined && id(row.listing_id) !== listingId) throw Error("bookkeeping_asset_identity_mismatch");
    return { kind, remoteId: id(kind === "image" ? row.listing_image_id : row.listing_file_id), rank: typeof row.rank === "number" ? row.rank : null, fileName: kind === "customer_file" && typeof row.filename === "string" ? row.filename.slice(0,240) : null };
  });
  if (new Set(result.map(a => a.remoteId)).size !== result.length) throw Error("bookkeeping_duplicate_remote_asset");
  return result.sort((a,b) => a.remoteId.localeCompare(b.remoteId));
}
/** Build evidence only; no Etsy writes, status guesses, or automatic file/image associations. */
export function observeEtsyListing(product: WarlockProductManifest, listing: WarlockManifestListing, shopId: number, remote: Json, images: Json, files: Json, mappings: AssetMapping[] = []) {
  const listingId = listing.etsyListingId;
  if (!listingId || id(remote.listing_id) !== listingId || id(remote.shop_id) !== String(shopId)) throw Error("bookkeeping_listing_ownership_mismatch");
  if (!["active", "draft", "inactive", "sold_out", "expired"].includes(String(remote.state))) throw Error("bookkeeping_unknown_listing_state");
  if (remote.type !== (listing.fulfillment === "DIGITAL" ? "download" : "physical")) throw Error("bookkeeping_listing_type_mismatch");
  const remoteAssets = [...collection(images,"image",listingId), ...collection(files,"customer_file",listingId)];
  if (new Set(mappings.map(m => m.linkId)).size !== mappings.length) throw Error("bookkeeping_duplicate_mapping");
  const links = listing.assets.map(link => {
    const mapping = mappings.find(m => m.linkId === link.id);
    if (!mapping) return link;
    if (link.etsyRemoteId !== mapping.expectedRemoteId && link.etsyRemoteId !== mapping.remoteId) throw Error("bookkeeping_mapping_changed");
    if (!remoteAssets.some(a => a.kind === link.kind && a.remoteId === mapping.remoteId)) throw Error("bookkeeping_mapping_not_observed");
    return { ...link, etsyRemoteId: mapping.remoteId };
  });
  if (mappings.some(m => !links.some(l => l.id === m.linkId))) throw Error("bookkeeping_mapping_not_owned");
  const linkedIds = links.filter(l => l.etsyRemoteId).map(l => l.kind + ":" + l.etsyRemoteId);
  if (new Set(linkedIds).size !== linkedIds.length) throw Error("bookkeeping_duplicate_mapping");
  const discrepancies: Array<{ code: string; detail: string }> = [];
  const add = (code:string,detail:string) => discrepancies.push({code,detail});
  const delivery = remote.when_made === "made_to_order" ? "MADE_TO_ORDER" : "INSTANT_DOWNLOAD";
  if (listing.fulfillment === "DIGITAL" && delivery !== (listing.digitalDelivery ?? "INSTANT_DOWNLOAD")) add("digital_delivery_mismatch", "Saved delivery mode differs from Etsy.");
  if (remote.title !== listing.title) add("title_changed", "Etsy title differs from the saved listing title.");
  if (!hasRequiredEtsyAiDisclosure(String(remote.description ?? ""))) add("ai_disclosure_missing", "Etsy description lacks the required disclosure.");
  if (!remoteAssets.some(a => a.kind === "image")) add("listing_images_missing", "No Etsy listing images observed.");
  if (listing.fulfillment === "DIGITAL") {
    const variants = product.variants.filter(v => v.fulfillment === "DIGITAL");
    const observedPrice = money(remote.price);
    if (variants.length !== 1 || variants[0].retailPriceCents !== observedPrice) add("price_changed", "Observed Etsy price differs from the canonical digital price.");
    if (delivery === "INSTANT_DOWNLOAD" && !remoteAssets.some(a => a.kind === "customer_file")) add("download_files_missing", "Instant-download listing has no customer files.");
    if (delivery === "MADE_TO_ORDER" && remoteAssets.some(a => a.kind === "customer_file")) add("made_to_order_has_downloads", "Custom digital listing contains instant-download files.");
  }
  for (const link of links) {
    if (!link.etsyRemoteId) add("asset_mapping_missing", link.id);
    else if (!remoteAssets.some(a => a.kind === link.kind && a.remoteId === link.etsyRemoteId)) add("saved_asset_missing_on_etsy", link.id);
  }
  for (const asset of remoteAssets) if (!links.some(l => l.kind === asset.kind && l.etsyRemoteId === asset.remoteId)) add("unmapped_remote_asset", asset.kind + ":" + asset.remoteId);
  // Physical inventory and supplier configuration have separate verified reconciliation tools.
  if (listing.fulfillment === "PHYSICAL") add("supplier_verification_separate", "Use reconcile_printful_product and inspect_etsy_variant_prices to verify supplier mapping and physical edition prices.");
  return { schemaVersion: 1, canonicalFingerprint: listingEvidenceFingerprint({...listing,assets:links},product.variants), etsyListingId: listingId, shopId: String(shopId), fulfillment: listing.fulfillment,
    observedState: String(remote.state), digitalDelivery: listing.fulfillment === "DIGITAL" ? delivery : null,
    title: String(remote.title ?? "").slice(0,140), priceCents: listing.fulfillment === "DIGITAL" ? money(remote.price) : null,
    remoteAssets, canonicalAssetLinks: links.map(l => ({ linkId:l.id,kind:l.kind,assetId:l.asset.id,remoteId:l.etsyRemoteId })),
    discrepancies, assessment: discrepancies.length ? "NEEDS_REVIEW" : "VERIFIED", etsyMutated: false };
}
