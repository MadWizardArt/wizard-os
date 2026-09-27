import { Prisma } from "../app/generated/prisma/client";
import { deleteGrottoImages, grottoBlobConfigured } from "./grotto-blob";
import { prisma } from "./prisma";

type PurgeCounts = { nonFavoriteCount: number; favoriteCount: number; nonFavoriteBytes: number };

export async function grottoPurgeCounts(): Promise<PurgeCounts> {
  const [nonFavorites, favoriteCount] = await Promise.all([
    prisma.grottoImage.aggregate({ where: { deletedAt: null, favorite: false }, _count: { id: true }, _sum: { byteSize: true } }),
    prisma.grottoImage.count({ where: { deletedAt: null, favorite: true } }),
  ]);
  return {
    nonFavoriteCount: nonFavorites._count.id,
    favoriteCount,
    nonFavoriteBytes: nonFavorites._sum.byteSize ?? 0,
  };
}

async function removeLockedRows(ids: string[], requireNonFavorite: boolean) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`
      SELECT "id" FROM "GrottoImage"
      WHERE "id" IN (${Prisma.join(ids)}) AND "deletedAt" IS NULL
      FOR UPDATE
    `);
    const rows = await tx.grottoImage.findMany({
      where: { id: { in: ids }, deletedAt: null, ...(requireNonFavorite ? { favorite: false } : {}) },
      select: { id: true, blobUrl: true },
    });
    if (rows.length !== ids.length) throw new Error("One or more images changed before deletion. Nothing was deleted.");
    const blobUrls = rows.flatMap((row) => row.blobUrl ? [row.blobUrl] : []);
    if (blobUrls.length && !grottoBlobConfigured()) throw new Error("Blob storage is unavailable. Nothing was deleted.");
    await deleteGrottoImages(blobUrls);
    const deleted = await tx.grottoImage.deleteMany({
      where: { id: { in: ids }, deletedAt: null, ...(requireNonFavorite ? { favorite: false } : {}) },
    });
    if (deleted.count !== ids.length) throw new Error("Deletion did not complete. Please try again.");
    return deleted.count;
  }, { maxWait: 10_000, timeout: 60_000, isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function deleteGrottoImageIds(ids: string[]) {
  return removeLockedRows(ids, false);
}

export async function purgeNonFavoriteGrottoImages(expectedCount: number) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`
      SELECT "id" FROM "GrottoImage"
      WHERE "deletedAt" IS NULL AND "favorite" = false
      FOR UPDATE
    `);
    const rows = await tx.grottoImage.findMany({
      where: { deletedAt: null, favorite: false },
      select: { id: true, blobUrl: true },
    });
    if (rows.length !== expectedCount) throw new Error("The collection changed. Review the updated counts before deleting.");
    if (!rows.length) return 0;
    const blobUrls = rows.flatMap((row) => row.blobUrl ? [row.blobUrl] : []);
    if (blobUrls.length && !grottoBlobConfigured()) throw new Error("Blob storage is unavailable. Nothing was deleted.");
    await deleteGrottoImages(blobUrls);
    const deleted = await tx.grottoImage.deleteMany({ where: { id: { in: rows.map((row) => row.id) }, deletedAt: null, favorite: false } });
    if (deleted.count !== rows.length) throw new Error("Deletion did not complete. Please review the collection before trying again.");
    return deleted.count;
  }, { maxWait: 10_000, timeout: 60_000, isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
