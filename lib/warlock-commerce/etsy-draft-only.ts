import type { WarlockProductManifest, WarlockManifestAsset } from "../warlock-mcp/manifest.ts";
import { validateWarlockManifest } from "../warlock-mcp/manifest.ts";
import { evaluateCommerceGates } from "./gates.ts";
import { withLivePrintfulQuotes } from "./live-quotes.ts";
import type { SupplierPreflight } from "./printful-preflight.ts";

// No supplier-write dependency is accepted by this operation.
export type EtsyDraftOnlyDependencies<T> = {
  assertWritesEnabled: () => void;
  loadProduct: (productId: string) => Promise<WarlockProductManifest | null>;
  preflight: (manifest: WarlockProductManifest) => Promise<SupplierPreflight>;
  verifyAsset: (asset: WarlockManifestAsset & { productId: string }) => Promise<unknown>;
  writeDraft: (manifest: WarlockProductManifest) => Promise<T>;
};

export async function executeEtsyDraftOnly<T>(productId: string, deps: EtsyDraftOnlyDependencies<T>) {
  deps.assertWritesEnabled();
  let manifest = await deps.loadProduct(productId);
  if (!manifest) throw new Error("product_not_found");
  const packageValidation = validateWarlockManifest(manifest);
  let gates = evaluateCommerceGates(manifest);
  const physical = manifest.variants.some(v => v.fulfillment === "PHYSICAL");
  let supplier: SupplierPreflight | null = null;
  const report = () => ({ productId, packageValidation, gates, supplier,
    printfulMutated: false as const, published: false as const,
    productionReady: false as const,
    quoteScope: physical ? "PROVISIONAL_PREFLIGHT" as const : "NOT_APPLICABLE" as const });
  const blocked = (blockers: string[]) => ({ ...report(), state: "BLOCKED" as const, blockers });
  if (!packageValidation.ready || !gates.compliance.pass || !gates.supplier.pass || (!physical && !gates.margin.pass)) {
    return blocked([...new Set([...packageValidation.errors, ...gates.errors].map(e => e.code))]);
  }
  if (physical) {
    supplier = await deps.preflight(manifest);
    if (!supplier.pass) return blocked(["supplier_preflight_failed", ...supplier.errors]);
    try { manifest = withLivePrintfulQuotes(manifest, supplier); }
    catch (error) { return blocked([error instanceof Error ? error.message : "live_production_quote_failed"]); }
    gates = evaluateCommerceGates(manifest);
    if (!gates.pass) return blocked([...new Set(gates.errors.map(e => e.code))]);
  }
  try {
    for (const asset of manifest.assets) await deps.verifyAsset({ ...asset, productId });
  } catch { return blocked(["canonical_asset_storage_unavailable"]); }
  // Storage checks can outlast the quote; recheck immediately before Etsy writes.
  if (supplier) {
    try { manifest = withLivePrintfulQuotes(manifest, supplier); }
    catch (error) { return blocked([error instanceof Error ? error.message : "live_production_quote_expired"]); }
  }
  const etsy = await deps.writeDraft(manifest);
  return { ...report(), etsy,
    state: physical ? "DRAFT_CREATED_AWAITING_PLACEMENTS" as const : "DRAFT_CREATED_FOR_HUMAN_REVIEW" as const,
    pendingChecks: physical ? ["Ecommerce import", "Approved explicit print placements", "Combined placement costs and margins", "Matching supplier mockups and owner visual review"] : ["Owner draft review"],
    nextAction: physical
      ? "Use check_printful_import for read-only import inspection, then preview_printful_placements and explicitly approved apply_printful_placements. Do not use legacy single-master configuration for apparel. Review final supplier mockups and combined margins before release."
      : "Owner review required. Publishing remains manual." };
}
