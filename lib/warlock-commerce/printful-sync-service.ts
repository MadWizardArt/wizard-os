import type { WarlockProductManifest, WarlockManifestAsset } from "../warlock-mcp/manifest.ts";
import { inspectPrintfulImport, syncErrorCode } from "./printful-import.ts";
import type { PrintfulImportStatus, SyncRequest } from "./printful-import.ts";
import { etsySkuForVariant } from "./etsy-inventory.ts";

export type PrintfulSyncResult = Omit<PrintfulImportStatus, "state"> & { state: PrintfulImportStatus["state"] | "SYNCED"; configuredVariantIds?: string[] };
export type SyncDependencies = {
  request: SyncRequest;
  temporaryAsset: (asset: WarlockManifestAsset) => Promise<{ url: string }>;
  saveListing: (id: string, data: { printfulSyncProductId?: number; status: string; lastDraftSyncAt?: Date }) => Promise<unknown>;
  saveVariant: (id: string, data: { printfulSyncVariantId: number; etsySku: string }) => Promise<unknown>;
};

export async function configureImportedPrintful(manifest: WarlockProductManifest, deps: SyncDependencies): Promise<PrintfulSyncResult> {
  const imported = await inspectPrintfulImport(manifest, deps.request);
  if (imported.state === "SKIPPED" || imported.state === "BLOCKED" || imported.state === "PRINTFUL_API_ERROR") return imported;
  const listing = manifest.listings.find(l => l.fulfillment === "PHYSICAL")!;
  if (imported.state === "AWAITING_PRINTFUL_IMPORT") {
    await deps.saveListing(listing.id, { status: "WAITING_PRINTFUL" });
    return imported;
  }
  // Save imported identity before remote configuration so partial failures are resumable.
  await deps.saveListing(listing.id, { printfulSyncProductId: imported.printfulSyncProductId, status: imported.state === "VARIANT_MAPPING_FAILED" ? "PRINTFUL_MAPPING_FAILED" : "WAITING_PRINTFUL" });
  for (const mapped of imported.variants) {
    const variant = manifest.variants.find(v => v.id === mapped.variantId)!;
    await deps.saveVariant(variant.id, { printfulSyncVariantId: mapped.printfulSyncVariantId, etsySku: etsySkuForVariant(variant) });
  }
  if (imported.state === "VARIANT_MAPPING_FAILED") return imported;
  const master = manifest.assets.find(a => a.role === "master");
  if (!master) return { ...imported, state: "BLOCKED", errorCode: "master_missing", nextAction: "Attach the approved master file before configuration." };
  // Validate the complete set before configuring any remote edition.
  if (imported.variants.some(mapped => {
    const variant = manifest.variants.find(v => v.id === mapped.variantId)!;
    return !variant.printfulVariantId || !variant.retailPriceCents;
  })) return { ...imported, state: "BLOCKED", errorCode: "printful_variant_configuration_missing", nextAction: "Complete approved catalog mappings and retail prices, then retry." };
  const configuredVariantIds: string[] = [];
  for (const mapped of imported.variants) {
    const variant = manifest.variants.find(v => v.id === mapped.variantId)!;
    const temporary = await deps.temporaryAsset(master);
    try {
      await deps.request("/sync/variant/" + mapped.printfulSyncVariantId, imported.storeId!, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variant_id: variant.printfulVariantId, retail_price: (variant.retailPriceCents! / 100).toFixed(2), sku: etsySkuForVariant(variant), is_ignored: false,
          files: [{ type: "default", url: temporary.url, filename: master.fileName, visible: true }] }),
      });
    } catch (error) {
      return { ...imported, state: "PRINTFUL_API_ERROR", checkedAt: new Date().toISOString(), errorCode: syncErrorCode(error), configuredVariantIds, nextAction: "The imported IDs and Etsy draft are saved. Resolve the Printful API error and retry confirmed execution to finish configuration." };
    }
    configuredVariantIds.push(variant.id);
  }
  await deps.saveListing(listing.id, { printfulSyncProductId: imported.printfulSyncProductId, status: "SYNCED", lastDraftSyncAt: new Date() });
  return { ...imported, state: "SYNCED", configuredVariantIds, nextAction: "Review the Etsy draft and Printful configuration. Publish manually only when approved." };
}
