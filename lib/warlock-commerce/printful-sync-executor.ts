import { printfulSyncPersistence } from "./printful-sync-persistence.ts";
import type { WarlockProductManifest } from "../warlock-mcp/manifest.ts";
import { prisma } from "../prisma";
import { createTemporaryPrintfulAssetUrl } from "./asset-delivery.ts";
import { assertCommerceDraftWritesEnabled } from "./write-guard.ts";
import { printfulSyncRequest } from "./printful-import.ts";
import { configureImportedPrintful } from "./printful-sync-service.ts";
export type { PrintfulSyncResult } from "./printful-sync-service.ts";

export async function syncPhysicalListingToPrintful(manifest: WarlockProductManifest) {
  assertCommerceDraftWritesEnabled();
  return configureImportedPrintful(manifest, {
    request: printfulSyncRequest,
    temporaryAsset: createTemporaryPrintfulAssetUrl,
    ...printfulSyncPersistence(prisma),
  });
}
