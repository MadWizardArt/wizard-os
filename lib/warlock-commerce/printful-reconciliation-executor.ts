import { printfulSyncPersistence } from "./printful-sync-persistence.ts";
import { prisma } from "../prisma";
import { getWarlockEtsyOperatorContext } from "../warlock-auth";
import { findWarlockProduct } from "../warlock-mcp/repository";
import { verifyIntakeAsset } from "../warlock-intake-assets";
import { assertCommerceDraftWritesEnabled } from "./write-guard.ts";
import { readEtsyForReconciliation } from "./etsy-reconciliation-read";
import { reconcileActivePrintful } from "./printful-reconciliation.ts";
import { runPrintfulSupplierPreflight } from "./printful-preflight.ts";
import { printfulSyncRequest } from "./printful-import.ts";
import { createTemporaryPrintfulAssetUrl } from "./asset-delivery.ts";

export async function reconcilePrintfulProduct(productId: string) {
  assertCommerceDraftWritesEnabled();
  const manifest = await findWarlockProduct({ productId });
  if (!manifest) throw new Error("product_not_found");
  const { auth, shopId } = await getWarlockEtsyOperatorContext();
  return reconcileActivePrintful(manifest, shopId, {
    etsyRead: path => readEtsyForReconciliation(auth.session.access_token, path),
    supplier: runPrintfulSupplierPreflight,
    verifyMaster: asset => verifyIntakeAsset({ ...asset, productId }),
    sync: {
      request: printfulSyncRequest, temporaryAsset: createTemporaryPrintfulAssetUrl,
      ...printfulSyncPersistence(prisma),
    },
  });
}
