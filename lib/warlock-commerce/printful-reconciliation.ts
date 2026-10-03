import { etsyListingType } from "./etsy-listing-type.ts";
import type { WarlockProductManifest, WarlockManifestAsset } from "../warlock-mcp/manifest.ts";
import type { SupplierPreflight } from "./printful-preflight.ts";
import type { SyncDependencies } from "./printful-sync-service.ts";
import { configureImportedPrintful } from "./printful-sync-service.ts";
import { withLivePrintfulQuotes } from "./live-quotes.ts";
import { evaluateCommerceGates } from "./gates.ts";
import { etsySkuForVariant } from "./etsy-inventory.ts";
import { hasRequiredEtsyAiDisclosure } from "./policy.ts";

type Json = Record<string, unknown>;
type Dependencies = {
  etsyRead: (path: string) => Promise<Json>;
  supplier: (manifest: WarlockProductManifest) => Promise<SupplierPreflight>;
  verifyMaster: (asset: WarlockManifestAsset) => Promise<unknown>;
  sync: SyncDependencies;
};
function record(value: unknown): Json { return value && typeof value === "object" && !Array.isArray(value) ? value as Json : {}; }
function rows(value: unknown): Json[] { return Array.isArray(value) ? value.map(record) : []; }
function priceCents(value: unknown) {
  const p = record(value), amount = p.amount, divisor = p.divisor;
  if (p.currency_code !== "USD" || typeof amount !== "number" || !Number.isSafeInteger(amount) || amount <= 0 || typeof divisor !== "number" || !Number.isSafeInteger(divisor) || divisor <= 0 || !Number.isSafeInteger(amount * 100) || (amount * 100) % divisor !== 0) throw new Error("etsy_inventory_price_invalid");
  return amount * 100 / divisor;
}
function verifyActiveInventory(manifest: WarlockProductManifest, shopId: number, listing: Json, inventory: Json) {
  const id = manifest.listings[0].etsyListingId;
  if (String(listing.listing_id ?? "") !== id || String(listing.shop_id ?? "") !== String(shopId)) throw new Error("etsy_listing_ownership_mismatch");
  if (etsyListingType(listing) !== "physical") throw new Error("etsy_listing_type_mismatch");
  if (listing.state !== "active") throw new Error("etsy_listing_not_active");
  if (!hasRequiredEtsyAiDisclosure(String(listing.description ?? ""))) throw new Error("etsy_active_disclosure_missing");
  const products = rows(inventory.products).filter(p => p.is_deleted !== true);
  if (products.length !== manifest.variants.length) throw new Error("etsy_inventory_variant_set_changed");
  const used = new Set<string>();
  return manifest.variants.map(variant => {
    const sku = etsySkuForVariant(variant);
    const matches = products.filter(p => String(p.sku ?? "") === sku || (variant.etsyProductId && String(p.product_id ?? "") === variant.etsyProductId));
    if (matches.length !== 1 || String(matches[0].sku ?? "") !== sku) throw new Error("etsy_inventory_variant_identity_mismatch");
    const remote = matches[0], productId = String(remote.product_id ?? "");
    if (!/^[1-9]\d*$/.test(productId) || used.has(productId) || (variant.etsyProductId && variant.etsyProductId !== productId) || (variant.etsyListingId && variant.etsyListingId !== id)) throw new Error("etsy_inventory_variant_identity_mismatch");
    used.add(productId);
    const offerings = rows(remote.offerings).filter(o => o.is_deleted !== true && o.is_enabled === true);
    if (offerings.length !== 1 || priceCents(offerings[0].price) !== variant.retailPriceCents) throw new Error("etsy_inventory_price_changed");
    return { ...variant, etsyListingId: id, etsyProductId: productId, etsySku: sku };
  });
}
function safeError(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  return /^(etsy_(http_\d{3}|listing_ownership_mismatch|listing_type_mismatch|listing_type_conflict|listing_type_unknown|listing_not_active|active_disclosure_missing|inventory_(variant_set_changed|variant_identity_mismatch|price_invalid|price_changed)|invalid_response)|live_production_quote_(missing_or_mismatched|expired)|supplier_preflight_failed|canonical_asset_storage_unavailable)$/.test(code) ? code : "printful_reconciliation_failed";
}

/** Only the physical listing is reconciled. Etsy remains read-only throughout. */
export async function reconcileActivePrintful(manifest: WarlockProductManifest, shopId: number, deps: Dependencies) {
  const physical = { ...manifest, variants: manifest.variants.filter(v => v.fulfillment === "PHYSICAL"), listings: manifest.listings.filter(l => l.fulfillment === "PHYSICAL") };
  const etsyListingId = physical.listings[0]?.etsyListingId;
  const base = { productId: manifest.id, etsyListingId, mode: "PRINTFUL_RECONCILIATION" as const, etsyMutated: false as const };
  const blocked = (code: string) => ({ ...base, state: "BLOCKED" as const, checkedAt: new Date().toISOString(), blockers: [code], nextAction: "Resolve the reported identity, price, asset, supplier or compliance issue, then retry reconciliation. The existing Etsy listing is preserved." });
  if (!physical.variants.length || physical.listings.length !== 1 || !etsyListingId || !/^[1-9]\d*$/.test(etsyListingId)) return blocked("physical_etsy_listing_missing");
  try {
    const read = async () => {
      const listing = await deps.etsyRead("/listings/" + etsyListingId);
      const inventory = await deps.etsyRead("/listings/" + etsyListingId + "/inventory?legacy=false");
      return verifyActiveInventory(physical, shopId, listing, inventory);
    };
    physical.variants = await read();
    const supplier = await deps.supplier(physical);
    if (!supplier.pass) return { ...blocked("supplier_preflight_failed"), supplier };
    let fresh = withLivePrintfulQuotes(physical, supplier);
    const gates = evaluateCommerceGates(fresh);
    if (!gates.pass) return { ...blocked("commerce_gates_failed"), gates, supplier, blockers: gates.errors.map(e => e.code) };
    const master = fresh.assets.find(a => a.role === "master");
    if (!master) return blocked("master_missing");
    try { await deps.verifyMaster(master); } catch { return blocked("canonical_asset_storage_unavailable"); }
    // Re-read active state, ownership, identifiers and prices after slow supplier/storage checks.
    const rechecked = await read();
    if (JSON.stringify(rechecked.map(v => [v.id,v.etsyProductId,v.etsySku])) !== JSON.stringify(physical.variants.map(v => [v.id,v.etsyProductId,v.etsySku]))) return blocked("etsy_inventory_variant_identity_mismatch");
    fresh = withLivePrintfulQuotes({ ...physical, variants: rechecked }, supplier);
    const printful = await configureImportedPrintful(fresh, deps.sync, { preserveStoreInventory: true, beforeConfigure: () => { withLivePrintfulQuotes(fresh, supplier); } });
    return { ...base, checkedAt: printful.checkedAt, state: printful.state === "SYNCED" ? "RECONCILED" as const : printful.state === "AWAITING_PRINTFUL_IMPORT" ? "AWAITING_PRINTFUL_IMPORT" as const : "BLOCKED" as const,
      gates, supplier, printful, ...(printful.errorCode ? { blockers: [printful.errorCode] } : {}),
      nextAction: printful.state === "SYNCED" ? "Review the Printful configuration for the existing active Etsy listing." : printful.state === "AWAITING_PRINTFUL_IMPORT" ? "The active Etsy listing is preserved. Verify the store import prerequisite and use Refresh data once, then check_printful_import and retry reconciliation after import." : "Resolve the reported Printful mapping or API error, then retry reconcile_printful_product. The active Etsy listing is preserved." };
  } catch (error) { return blocked(safeError(error)); }
}
