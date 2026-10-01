import type { PrismaClient } from "../../app/generated/prisma/client";
import { storedSyncId } from "./sync-id-storage.ts";
import type { SyncDependencies } from "./printful-sync-service.ts";
export function printfulSyncPersistence(db: PrismaClient): Pick<SyncDependencies, "saveListing" | "saveVariant"> {
  return {
    saveListing: (id, data) => {
      const { printfulSyncProductId, ...rest } = data;
      return db.spellmarkListing.update({ where: { id }, data: {
        ...rest, ...(printfulSyncProductId === undefined ? {} : { printfulSyncProductId: storedSyncId(printfulSyncProductId) }),
      } });
    },
    saveVariant: (id, data) => db.spellmarkVariant.update({ where: { id }, data: {
      ...data, printfulSyncVariantId: storedSyncId(data.printfulSyncVariantId),
    } }),
  };
}
