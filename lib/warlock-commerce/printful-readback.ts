import { PrintfulSyncConfigurationError } from "./printful-sync-configuration.ts";

/** Retry reads only. Never repeat a supplier write after an uncertain response. */
export async function readProcessedConfiguration<T>(read: () => Promise<unknown>, verify: (payload: unknown) => T,
  wait: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms))): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const payload = await read();
    try { return verify(payload); }
    catch (error) {
      if (!(error instanceof PrintfulSyncConfigurationError) || error.message !== "printful_file_processing_pending" || attempt >= 2) throw error;
      await wait(1000);
    }
  }
}
