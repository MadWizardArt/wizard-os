import { readSyncConfiguration, PrintfulSyncConfigurationError, type SyncConfigurationIssue } from "./printful-sync-configuration.ts";
import { readProcessedConfiguration } from "./printful-readback.ts";
import type { PrintfulQuote } from "./printful-catalog.ts";
import type { WarlockProductManifest, WarlockManifestAsset } from "../warlock-mcp/manifest.ts";
import { inspectPrintfulImport, syncErrorCode } from "./printful-import.ts";
import type { PrintfulImportStatus, SyncRequest } from "./printful-import.ts";
import { etsySkuForVariant } from "./etsy-inventory.ts";

export type PrintfulSyncResult = Omit<PrintfulImportStatus, "state"> & { state: PrintfulImportStatus["state"] | "SYNCED"; configuredVariantIds?: string[]; diagnostic?: { stage: string; variantId?: string; causeCode: string; providerMessage?: string; configurationIssues?: SyncConfigurationIssue[] } };
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
    const masters = manifest.assets.filter(a => a.role === "master");
    if (masters.length > 1) return { ...imported, state: "BLOCKED", errorCode: "printful_explicit_placement_plan_required", nextAction: "Multiple approved masters require preview_printful_placements and an approved apply_printful_placements call. No master or placement is selected automatically." };
    const master = masters[0];
    if (master && !["image/png", "image/jpeg", "image/webp"].includes(master.contentType)) return { ...imported, state: "BLOCKED", errorCode: "printful_master_image_required", nextAction: "Select an approved image export for Printful; document masters cannot be printed directly." };
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
      stage = "VERIFY_SYNC_CONFIGURATION";
      const savedPayload=await readProcessedConfiguration(()=>deps.request("/sync/variant/"+mapped.printfulSyncVariantId,imported.storeId!), payload=>{
        readSyncConfiguration(payload,mapped.printfulSyncVariantId,variant.printfulVariantId!,imported.printfulSyncProductId);
        return payload as Record<string,unknown>;
      });
      const saved=readSyncConfiguration(savedPayload,mapped.printfulSyncVariantId,variant.printfulVariantId!,imported.printfulSyncProductId);
      const savedFiles=(savedPayload?.result as {sync_variant?:{files?:Array<{type?:string;url?:string;position?:unknown}>}})?.sync_variant?.files?.filter(f=>f.type!=="preview") ?? [];
      if(!saved.configured || savedFiles.length!==1 || savedFiles[0].type!=="default" || savedFiles[0].url!==temporary.url || savedFiles[0].position!=null) throw new Error("printful_placement_verification_failed");
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
      diagnostic: { stage, variantId, causeCode, ...(error instanceof PrintfulSyncConfigurationError ? {configurationIssues:error.configurationIssues} : {}), ...(stage === "CONFIGURE_SYNC_VARIANT" && typeof row.providerMessage === "string" ? { providerMessage: row.providerMessage } : {}) },
      nextAction: causeCode === "printful_file_processing_pending" ? "Printful is still processing the existing upload. Use check_printful_import to inspect every variant, then retry once processing finishes. Do not upload the artwork again."
        : causeCode === "printful_existing_configuration_incomplete" ? "Use check_printful_import for all variant field diagnostics. Existing production files or conflicting mappings are preserved; repair them through an explicitly approved placement preview."
        : options.preserveStoreInventory ? "The active Etsy listing is preserved. Resolve the reported stage/cause and retry reconcile_printful_product." : "The Etsy draft is preserved. Resolve the reported stage/cause and retry confirmed execution." };
  }
}
