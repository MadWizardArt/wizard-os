import { executeEtsyDraftOnly } from "./etsy-draft-only.ts";
import { assertCommerceDraftWritesEnabled } from "./write-guard.ts";
import { findWarlockProduct } from "../warlock-mcp/repository.ts";
import { runPrintfulSupplierPreflight } from "./printful-preflight.ts";
import { verifyIntakeAsset } from "../warlock-intake-assets.ts";
import { executeEtsyDrafts } from "./etsy-draft-executor.ts";

export function executeEtsyDraftOnlyProduct(productId: string) {
  return executeEtsyDraftOnly(productId, {
    assertWritesEnabled: assertCommerceDraftWritesEnabled,
    loadProduct: id => findWarlockProduct({ productId: id }),
    preflight: runPrintfulSupplierPreflight,
    verifyAsset: verifyIntakeAsset,
    writeDraft: executeEtsyDrafts,
  });
}
