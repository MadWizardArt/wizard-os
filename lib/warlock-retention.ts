import { del } from "@vercel/blob";
import { Prisma } from "../app/generated/prisma/client";
import { prisma } from "./prisma";

const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export type WarlockRetentionResult = {
  scannedProducts: number;
  purgedProducts: number;
  purgedAssets: number;
  releasedBytes: number;
};

function eligibleProduct(product: {
  keepInWarlock: boolean;
  assets: Array<{ id: string; blobUrl: string; byteSize: number; listingLinks: Array<{ etsyRemoteId: string | null; etsySyncedAt: Date | null }> }>;
  listings: Array<{ fulfillment: "DIGITAL" | "PHYSICAL"; etsyListingId: string | null; printfulSyncProductId: string | null; lastDraftSyncAt: Date | null }>;
}, cutoff: Date) {
  if (product.keepInWarlock || !product.assets.length || !product.listings.length) return false;

  for (const listing of product.listings) {
    if (!listing.etsyListingId || !listing.lastDraftSyncAt || listing.lastDraftSyncAt > cutoff) return false;
    if (listing.fulfillment === "PHYSICAL" && !listing.printfulSyncProductId) return false;
  }

  for (const asset of product.assets) {
    for (const link of asset.listingLinks) {
      if (!link.etsyRemoteId || !link.etsySyncedAt || link.etsySyncedAt > cutoff) return false;
    }
  }
  return true;
}

export async function purgeExpiredWarlockAssets(now = new Date()): Promise<WarlockRetentionResult> {
  const cutoff = new Date(now.getTime() - RETENTION_MS);
  const products = await prisma.spellmarkProduct.findMany({
    where: {
      keepInWarlock: false,
      assets: { some: {} },
      listings: { some: { etsyListingId: { not: null }, lastDraftSyncAt: { lte: cutoff } } },
    },
    select: {
      id: true,
      keepInWarlock: true,
      assets: {
        select: {
          id: true,
          blobUrl: true,
          byteSize: true,
          listingLinks: { select: { etsyRemoteId: true, etsySyncedAt: true } },
        },
      },
      listings: {
        select: {
          fulfillment: true,
          etsyListingId: true,
          printfulSyncProductId: true,
          lastDraftSyncAt: true,
        },
      },
    },
  });

  let purgedProducts = 0;
  let purgedAssets = 0;
  let releasedBytes = 0;

  for (const product of products) {
    if (!eligibleProduct(product, cutoff)) continue;

    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`
        SELECT "id" FROM "SpellmarkProduct"
        WHERE "id" = ${product.id}
        FOR UPDATE
      `);

      const locked = await tx.spellmarkProduct.findUnique({
        where: { id: product.id },
        select: {
          keepInWarlock: true,
          assets: {
            select: {
              id: true,
              blobUrl: true,
              byteSize: true,
              listingLinks: { select: { etsyRemoteId: true, etsySyncedAt: true } },
            },
          },
          listings: {
            select: {
              fulfillment: true,
              etsyListingId: true,
              printfulSyncProductId: true,
              lastDraftSyncAt: true,
            },
          },
        },
      });

      if (!locked || !eligibleProduct(locked, cutoff)) return;

      const blobUrls = [...new Set(locked.assets.map((asset) => asset.blobUrl).filter(Boolean))];
      const bytes = locked.assets.reduce((sum, asset) => sum + asset.byteSize, 0);

      if (blobUrls.length) await del(blobUrls);
      const deleted = await tx.spellmarkAsset.deleteMany({ where: { productId: product.id } });
      await tx.spellmarkProduct.update({
        where: { id: product.id },
        data: { assetsPurgedAt: now },
      });
      await tx.spellmarkJournal.create({
        data: {
          productId: product.id,
          requestId: crypto.randomUUID(),
          kind: "ASSET_RETENTION_PURGE",
          bodyJson: JSON.stringify({
            policyDays: 7,
            purgedAssets: deleted.count,
            releasedBytes: bytes,
            keepInWarlock: false,
          }),
        },
      });

      purgedProducts += 1;
      purgedAssets += deleted.count;
      releasedBytes += bytes;
    }, { maxWait: 10_000, timeout: 60_000 });
  }

  return { scannedProducts: products.length, purgedProducts, purgedAssets, releasedBytes };
}
