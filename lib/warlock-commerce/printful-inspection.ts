import type { WarlockProductManifest } from "../warlock-mcp/manifest.ts";
import { inspectPrintfulImport, printfulSyncRequest, syncErrorCode, type SyncRequest } from "./printful-import.ts";
import { readSyncConfiguration, PrintfulSyncConfigurationError } from "./printful-sync-configuration.ts";

/** Read-only inspection of every imported variant, even when an earlier variant is incomplete. */
export async function inspectPrintfulProduction(manifest: WarlockProductManifest, request: SyncRequest = printfulSyncRequest) {
  const imported = await inspectPrintfulImport(manifest, request);
  if (!imported.storeId || !imported.printfulSyncProductId || !imported.variants.length) return imported;
  const configurations = [];
  for (const mapped of imported.variants) {
    const variant = manifest.variants.find(v => v.id === mapped.variantId)!;
    const base = {variantId:variant.id, label:variant.label, syncVariantId:mapped.printfulSyncVariantId};
    if (!variant.printfulVariantId) { configurations.push({...base,state:"NEEDS_MAPPING"}); continue; }
    try {
      const configuration = readSyncConfiguration(await request("/sync/variant/"+mapped.printfulSyncVariantId, imported.storeId), mapped.printfulSyncVariantId, variant.printfulVariantId, imported.printfulSyncProductId);
      configurations.push(configuration.configured
        ? {...base,state:"CONFIGURED",fileTypes:configuration.fileTypes,configurationFingerprint:configuration.fingerprint}
        : {...base,state:"EMPTY_IMPORT",configurationIssues:configuration.configurationIssues});
    } catch (error) {
      configurations.push({...base,state:error instanceof PrintfulSyncConfigurationError && error.message === "printful_file_processing_pending" ? "PROCESSING" : "NEEDS_REVIEW",
        errorCode:error instanceof PrintfulSyncConfigurationError ? error.message : syncErrorCode(error),
        ...(error instanceof PrintfulSyncConfigurationError ? {configurationIssues:error.configurationIssues} : {})});
    }
  }
  return {...imported,checkedAt:new Date().toISOString(),configurations,productionVerified:false,
    nextAction:"EMPTY_IMPORT can use confirmed execution with the approved single master. PROCESSING requires another read after Printful finishes, not another upload. NEEDS_REVIEW requires the reported field to be resolved or an approved placement preview. CONFIGURED describes supplier state only; compare approved artwork and review mockups before production."};
}
