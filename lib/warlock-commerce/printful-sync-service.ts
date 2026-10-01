import { readSyncConfiguration } from "./printful-sync-configuration.ts";
import type { PrintfulQuote } from "./printful-catalog.ts";
import type { WarlockProductManifest, WarlockManifestAsset } from "../warlock-mcp/manifest.ts";
import { inspectPrintfulImport, syncErrorCode } from "./printful-import.ts";
import type { PrintfulImportStatus, SyncRequest } from "./printful-import.ts";
import { etsySkuForVariant } from "./etsy-inventory.ts";

export type PrintfulSyncResult = Omit<PrintfulImportStatus, "state"> & { state: PrintfulImportStatus["state"] | "SYNCED"; configuredVariantIds?: string[]; diagnostic?: { stage: string; variantId?: string; causeCode: string; providerMessage?: string } };
export type SyncDependencies = {
  request: SyncRequest;
  temporaryAsset: (asset: WarlockManifestAsset) => Promise<{ url: string }>;
  saveListing: (id: string, data: { printfulSyncProductId?: number; status: string; lastDraftSyncAt?: Date }) => Promise<unknown>;
  saveVariant: (id: string, data: { printfulSyncVariantId: number; etsySku: string }) => Promise<unknown>;
};

export async function configureImportedPrintful(manifest: WarlockProductManifest, deps: SyncDependencies, options: { preserveStoreInventory?: boolean; beforeConfigure?: () => void } = {}): Promise<PrintfulSyncResult> {
  const imported = await inspectPrintfulImport(manifest, deps.request);
  if (imported.state === "SKIPPED" || imported.state === "BLOCKED" || imported.state === "PRINTFUL_API_ERROR") return imported;
  const listing = manifest.listings.find(l => l.fulfillment === "PHYSICAL")!;
  let stage = "SAVE_SYNC_PRODUCT";
  let variantId: string | undefined;
  const configuredVariantIds: string[] = [];
  try {
    if (imported.state === "AWAITING_PRINTFUL_IMPORT") {
      stage = "SAVE_IMPORT_WAIT";
      await deps.saveListing(listing.id, { status: "WAITING_PRINTFUL" });
      return imported;
    }
    // Save imported identity before remote configuration so partial failures are resumable.
    await deps.saveListing(listing.id, { printfulSyncProductId: imported.printfulSyncProductId, status: imported.state === "VARIANT_MAPPING_FAILED" ? "PRINTFUL_MAPPING_FAILED" : "WAITING_PRINTFUL" });
    for (const mapped of imported.variants) {
      const variant = manifest.variants.find(v => v.id === mapped.variantId)!;
      stage = "SAVE_SYNC_VARIANT"; variantId = variant.id;
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
    for (const mapped of imported.variants) {
      const variant = manifest.variants.find(v => v.id === mapped.variantId)!;
      variantId = variant.id;
      stage = "VERIFY_SYNC_CONFIGURATION";
      const remote=readSyncConfiguration(await deps.request("/sync/variant/"+mapped.printfulSyncVariantId,imported.storeId!),mapped.printfulSyncVariantId,variant.printfulVariantId!,imported.printfulSyncProductId);
      const quote:PrintfulQuote | undefined=variant.productionQuoteJson ? JSON.parse(variant.productionQuoteJson) : undefined;
      options.beforeConfigure?.();
      if(remote.configured){
        if(quote?.configurationKind!=="CONFIGURED_SYNC" || quote.syncVariantId!==mapped.printfulSyncVariantId || quote.configurationFingerprint!==remote.fingerprint) throw new Error("printful_saved_configuration_changed");
        // A configured variant already has its approved files. Never replace its placements on retry.
        configuredVariantIds.push(variant.id);
        continue;
      }
      if(quote?.configurationKind==="CONFIGURED_SYNC") throw new Error("printful_saved_configuration_changed");
      stage = "SIGN_MASTER_ASSET";
      const temporary = await deps.temporaryAsset(master);
      stage = "VERIFY_LIVE_QUOTE";
      options.beforeConfigure?.();
      stage = "CONFIGURE_SYNC_VARIANT";
      await deps.request("/sync/variant/" + mapped.printfulSyncVariantId, imported.storeId!, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ variant_id: variant.printfulVariantId,
            ...(options.preserveStoreInventory ? {} : { retail_price: (variant.retailPriceCents! / 100).toFixed(2), sku: etsySkuForVariant(variant) }),
            is_ignored: false,
            files: [{ type: "default", url: temporary.url, filename: master.fileName, visible: true }] }),
        });
      configuredVariantIds.push(variant.id);
    }
    stage = "SAVE_SYNC_COMPLETION"; variantId = undefined;
    await deps.saveListing(listing.id, { printfulSyncProductId: imported.printfulSyncProductId, status: "SYNCED", lastDraftSyncAt: new Date() });
    return { ...imported, state: "SYNCED", configuredVariantIds, nextAction: "Review the Etsy draft and Printful configuration. Publish manually only when approved." };
  } catch (error) {
    const row = error && typeof error === "object" ? error as { code?: unknown; name?: unknown; providerMessage?: unknown } : {};
    const causeCode = typeof row.code === "string" && /^P\d{4}$/.test(row.code) ? "prisma_" + row.code
      : row.name === "PrismaClientValidationError" ? "database_validation_failed"
      : error instanceof Error && /^(?:live_production_quote_expired|printful_[a-z0-9_]+)$/.test(error.message) ? error.message : syncErrorCode(error);
    const code = stage === "SAVE_IMPORT_WAIT" ? "printful_import_wait_persistence_failed"
      : stage === "SAVE_SYNC_PRODUCT" ? "printful_sync_product_persistence_failed"
      : stage === "SAVE_SYNC_VARIANT" ? "printful_sync_variant_persistence_failed"
      : stage === "SAVE_SYNC_COMPLETION" ? "printful_sync_completion_persistence_failed"
      : stage === "SIGN_MASTER_ASSET" ? "printful_asset_signing_failed"
      : stage === "VERIFY_LIVE_QUOTE" || stage === "VERIFY_SYNC_CONFIGURATION" ? causeCode : syncErrorCode(error);
    return { ...imported, state: stage === "CONFIGURE_SYNC_VARIANT" ? "PRINTFUL_API_ERROR" : "BLOCKED",
      checkedAt: new Date().toISOString(), errorCode: code, configuredVariantIds,
      diagnostic: { stage, variantId, causeCode, ...(stage === "CONFIGURE_SYNC_VARIANT" && typeof row.providerMessage === "string" ? { providerMessage: row.providerMessage } : {}) },
      nextAction: options.preserveStoreInventory ? "The active Etsy listing is preserved. Resolve the reported stage/cause and retry reconcile_printful_product." : "The Etsy draft is preserved. Resolve the reported stage/cause and retry confirmed execution." };
  }
}
