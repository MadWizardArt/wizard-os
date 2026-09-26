import { evaluateCommerceGates } from "./gates.ts";
import { executeEtsyDrafts } from "./etsy-draft-executor.ts";
import { runPrintfulSupplierPreflight } from "./printful-preflight.ts";
import { syncPhysicalListingToPrintful } from "./printful-sync-executor.ts";
import { assertCommerceDraftWritesEnabled } from "./write-guard.ts";
import { findWarlockProduct } from "../warlock-mcp/repository.ts";
import { validateWarlockManifest } from "../warlock-mcp/manifest.ts";

export type DraftExecutionResult = {
  productId: string;
  state: "BLOCKED" | "WAITING_PRINTFUL_IMPORT" | "READY_FOR_HUMAN_REVIEW";
  packageValidation: ReturnType<typeof validateWarlockManifest>;
  gates: ReturnType<typeof evaluateCommerceGates>;
  supplier: Awaited<ReturnType<typeof runPrintfulSupplierPreflight>> | null;
  etsy?: Awaited<ReturnType<typeof executeEtsyDrafts>>;
  printful?: Awaited<ReturnType<typeof syncPhysicalListingToPrintful>>;
  blockers?: string[];
};

export async function executeDraftProduct(productId: string): Promise<DraftExecutionResult> {
  assertCommerceDraftWritesEnabled();

  const manifest = await findWarlockProduct({ productId });
  if (!manifest) throw new Error("product_not_found");

  const packageValidation = validateWarlockManifest(manifest);
  const gates = evaluateCommerceGates(manifest);
  const blockers = [
    ...packageValidation.errors.map((entry) => entry.code),
    ...gates.errors.map((entry) => entry.code),
  ];

  if (!packageValidation.ready || !gates.pass) {
    return {
      productId,
      state: "BLOCKED",
      packageValidation,
      gates,
      supplier: null,
      blockers: [...new Set(blockers)],
    };
  }

  const hasPhysical = manifest.variants.some((variant) => variant.fulfillment === "PHYSICAL");
  const supplier = hasPhysical
    ? await runPrintfulSupplierPreflight(manifest)
    : null;

  if (supplier && !supplier.pass) {
    return {
      productId,
      state: "BLOCKED",
      packageValidation,
      gates,
      supplier,
      blockers: ["supplier_preflight_failed", ...supplier.errors],
    };
  }

  const etsy = await executeEtsyDrafts(manifest);
  const refreshed = await findWarlockProduct({ productId });
  if (!refreshed) throw new Error("product_missing_after_etsy_execution");

  const printful = await syncPhysicalListingToPrintful(refreshed);
  if (printful.state === "WAITING_PRINTFUL_IMPORT") {
    return {
      productId,
      state: "WAITING_PRINTFUL_IMPORT",
      packageValidation,
      gates,
      supplier,
      etsy,
      printful,
    };
  }

  return {
    productId,
    state: "READY_FOR_HUMAN_REVIEW",
    packageValidation,
    gates,
    supplier,
    etsy,
    printful,
  };
}
