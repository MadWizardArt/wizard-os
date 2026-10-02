import { Prisma } from "../app/generated/prisma/client";
import { deleteGrottoImages, grottoBlobConfigured } from "./grotto-blob";
import { prisma } from "./prisma";

type PurgeCounts = { nonFavoriteCount: number; favoriteCount: number; nonFavoriteBytes: number };
export type PurgeBatchResult = { deleted: number; remaining: number; favoriteCount: number; releasedBytes: number };

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

export async function purgeNonFavoriteGrottoImages(expectedCount: number, batchSize = 100): Promise<PurgeBatchResult> {
  const safeBatchSize = Math.max(1, Math.min(100, Math.floor(batchSize)));
  const current = await grottoPurgeCounts();
  if (current.nonFavoriteCount !== expectedCount) {
    throw new Error("The collection changed. Review the updated counts before deleting.");
  }
  if (!current.nonFavoriteCount) {
    return { deleted: 0, remaining: 0, favoriteCount: current.favoriteCount, releasedBytes: 0 };
  }

  const rows = await prisma.grottoImage.findMany({
    where: { deletedAt: null, favorite: false },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: safeBatchSize,
    select: { id: true, blobUrl: true, byteSize: true },
  });

  const ids = rows.map((row) => row.id);
  const blobUrls = rows.flatMap((row) => row.blobUrl ? [row.blobUrl] : []);
  if (blobUrls.length && !grottoBlobConfigured()) throw new Error("Blob storage is unavailable. Nothing was deleted.");

  await deleteGrottoImages(blobUrls);

  const deleted = await prisma.grottoImage.deleteMany({
    where: { id: { in: ids }, deletedAt: null, favorite: false },
  });
  if (deleted.count !== ids.length) {
    throw new Error("A batch changed during deletion. Stop and review the collection before continuing.");
  }

  const remaining = expectedCount - deleted.count;
  return {
    deleted: deleted.count,
    remaining,
    favoriteCount: current.favoriteCount,
    releasedBytes: rows.reduce((sum, row) => sum + row.byteSize, 0),
  };
}
