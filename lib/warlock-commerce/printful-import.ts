import type { WarlockProductManifest, WarlockManifestVariant } from "../warlock-mcp/manifest.ts";
import { etsySkuForVariant } from "./etsy-inventory.ts";

type Json = Record<string, unknown>;
export type SyncRequest = (path: string, storeId: number, init?: RequestInit, allow404?: boolean) => Promise<Json | null>;
export type ImportMatch = { variantId: string; printfulSyncVariantId: number; printfulVariantId: number | null };
export type PrintfulImportStatus = {
  productId: string;
  state: "SKIPPED" | "BLOCKED" | "AWAITING_PRINTFUL_IMPORT" | "IMPORTED" | "VARIANT_MAPPING_FAILED" | "PRINTFUL_API_ERROR";
  checkedAt: string;
  etsyListingId?: string;
  storeId?: number;
  printfulSyncProductId?: number;
  variants: ImportMatch[];
  unmatchedVariantIds?: string[];
  errorCode?: string;
  importPrerequisite: { setting: string; verification: "MANUAL_CHECK_REQUIRED" };
  nextAction: string;
};
const prerequisite = { setting: "Import not synced products", verification: "MANUAL_CHECK_REQUIRED" as const };
function positiveId(value: unknown) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}
function object(value: unknown): Json | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Json : null;
}
export function syncErrorCode(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  return /^printful_(http_\d{3}|token_missing|invalid_response|sync_identity_mismatch)$/.test(code) ? code : "printful_request_failed";
}
export const printfulSyncRequest: SyncRequest = async (path, storeId, init = {}, allow404 = false) => {
  if (!/^\/sync\/(products\/@[1-9]\d*|variant\/[1-9]\d*)$/.test(path)) throw new Error("printful_invalid_request");
  const token = process.env.PRINTFUL_PRIVATE_TOKEN?.trim();
  if (!token) throw new Error("printful_token_missing");
  const response = await fetch("https://api.printful.com" + path, {
    ...init,
    headers: { ...init.headers, Authorization: "Bearer " + token, "X-PF-Language": "en_US", "X-PF-Store-Id": String(storeId) },
    cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15_000),
  });
  if (allow404 && response.status === 404) return null;
  if (!response.ok) {
    const payload = object(await response.json().catch(() => null));
    const upstream = object(payload?.error);
    const raw = upstream?.message ?? payload?.result;
    const providerMessage = typeof raw === "string" ? raw.split(token).join("[redacted]")
      .replace(/https?:\/\/[^\s"'<>]+/g, "[redacted URL]")
      .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
      .replace(/\b(authorization|token|secret|signature)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
      .replace(/[\r\n]+/g, " ").slice(0, 240) : undefined;
    throw Object.assign(new Error("printful_http_" + response.status), { providerMessage });
  }
  const payload = object(await response.json().catch(() => null));
  if (!payload) throw new Error("printful_invalid_response");
  return payload;
};
function match(canonical: WarlockManifestVariant, candidates: Json[]) {
  const sku = etsySkuForVariant(canonical);
  const matches = candidates.filter(candidate =>
    (canonical.printfulSyncVariantId && positiveId(candidate.id) === canonical.printfulSyncVariantId) ||
    (canonical.etsyProductId && String(candidate.external_id ?? "") === canonical.etsyProductId) ||
    String(candidate.sku ?? "") === sku);
  // Conflicting identifiers or duplicated SKUs must never pick an arbitrary variant.
  if (matches.length !== 1 || !positiveId(matches[0].id)) return null;
  const remote = matches[0];
  if (canonical.printfulSyncVariantId && positiveId(remote.id) !== canonical.printfulSyncVariantId) return null;
  if (canonical.etsyProductId && String(remote.external_id ?? "") !== canonical.etsyProductId) return null;
  return remote;
}

/** Read-only live inspection; does not refresh the store, write IDs, or modify Etsy. */
export async function inspectPrintfulImport(manifest: WarlockProductManifest, request: SyncRequest = printfulSyncRequest): Promise<PrintfulImportStatus> {
  const base = { productId: manifest.id, checkedAt: new Date().toISOString(), variants: [] as ImportMatch[], importPrerequisite: prerequisite };
  const physical = manifest.variants.filter(v => v.fulfillment === "PHYSICAL");
  if (!physical.length) return { ...base, state: "SKIPPED", nextAction: "No physical editions require Printful." };
  const listing = manifest.listings.find(l => l.fulfillment === "PHYSICAL");
  if (!listing?.etsyListingId || !/^[1-9]\d*$/.test(listing.etsyListingId)) return { ...base, state: "BLOCKED", errorCode: "physical_etsy_draft_missing", nextAction: "Create the confirmed Etsy draft first." };
  const stores = [...new Set(physical.map(v => v.printfulStoreId))];
  if (stores.length !== 1 || !positiveId(stores[0])) return { ...base, state: "BLOCKED", etsyListingId: listing.etsyListingId, errorCode: "physical_printful_store_mismatch", nextAction: "Select one connected Printful store for all physical editions." };
  const context = { ...base, etsyListingId: listing.etsyListingId, storeId: stores[0]! };
  try {
    const payload = await request("/sync/products/@" + listing.etsyListingId, context.storeId, {}, true);
    // Timestamp describes the completed live lookup, not the start of the request.
    context.checkedAt = new Date().toISOString();
    if (!payload) return { ...context, state: "AWAITING_PRINTFUL_IMPORT", nextAction: "In this Printful store, verify Import not synced products is enabled (if the toggle exists), then use Refresh data once. Etsy drafts import once daily, with a 1,000-listing limit. Later call check_printful_import; keep the Etsy listing in draft. A missing import alone cannot distinguish a disabled setting from a normal delay." };
    const result = object(payload.result);
    const product = object(result?.sync_product);
    const productId = positiveId(product?.id);
    if (!result || !productId || !Array.isArray(result.sync_variants)) throw new Error("printful_invalid_response");
    if (String(product?.external_id ?? "") !== listing.etsyListingId) throw new Error("printful_sync_identity_mismatch");
    const candidates = result.sync_variants.map(object).filter((v): v is Json => Boolean(v));
    const variants: ImportMatch[] = [];
    const unmatchedVariantIds: string[] = [];
    const used = new Map<number, string>();
    for (const variant of physical) {
      const remote = match(variant, candidates);
      const id = positiveId(remote?.id);
      if (!id) unmatchedVariantIds.push(variant.id);
      else if (used.has(id)) {
        unmatchedVariantIds.push(variant.id, used.get(id)!);
        const previous = variants.findIndex(v => v.printfulSyncVariantId === id);
        if (previous >= 0) variants.splice(previous, 1);
      }
      else { used.set(id, variant.id); variants.push({ variantId: variant.id, printfulSyncVariantId: id, printfulVariantId: variant.printfulVariantId }); }
    }
    // An incomplete or ambiguous match prevents all supplier configuration writes.
    if (unmatchedVariantIds.length) return { ...context, state: "VARIANT_MAPPING_FAILED", printfulSyncProductId: productId, variants, unmatchedVariantIds, errorCode: "printful_sync_variant_mapping_failed", nextAction: "The Etsy product is imported, but exact variants could not all be matched. Inspect the Etsy inventory and Printful external variant IDs/SKUs; do not treat this as an import delay." };
    return { ...context, state: "IMPORTED", printfulSyncProductId: productId, variants, nextAction: "Run execute_draft_product with confirmation to save imported IDs, configure approved variants, and stop for human review." };
  } catch (error) {
    return { ...context, checkedAt: new Date().toISOString(), state: "PRINTFUL_API_ERROR", errorCode: syncErrorCode(error), nextAction: "Resolve Printful authorization, API availability, or response identity errors, then repeat check_printful_import. The Etsy draft is preserved." };
  }
}
