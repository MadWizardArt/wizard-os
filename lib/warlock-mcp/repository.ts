import { prisma } from "../prisma";
import type { WarlockProductManifest } from "./manifest";

export type WarlockProductSelector = {
  productId?: string;
  title?: string;
};

const selection = {
  id: true,
  title: true,
  collection: true,
  description: true,
  artworkReference: true,
  status: true,
  notes: true,
  assets: {
    orderBy: { createdAt: "asc" as const },
    select: {
      id: true,
      role: true,
      fileName: true,
      blobUrl: true,
      pathname: true,
      contentType: true,
      byteSize: true,
    },
  },
  variants: {
    orderBy: { createdAt: "asc" as const },
    select: {
      id: true,
      fulfillment: true,
      label: true,
      printfulProductId: true,
      printfulVariantId: true,
      printfulStoreId: true,
      etsyListingId: true,
      etsySku: true,
      etsyProductId: true,
      printfulSyncVariantId: true,
      retailPriceCents: true,
      productionBaseCents: true,
      productionQuotedAt: true,
      currency: true,
    },
  },
  listings: {
    orderBy: { fulfillment: "asc" as const },
    select: {
      id: true,
      fulfillment: true,
      title: true,
      description: true,
      tagsJson: true,
      taxonomyId: true,
      shippingProfileId: true,
      readinessStateId: true,
      quantity: true,
      whoMade: true,
      whenMade: true,
      isSupply: true,
      shouldAutoRenew: true,
      etsyListingId: true,
      printfulSyncProductId: true,
      lastDraftSyncAt: true,
      status: true,
      assets: {
        orderBy: { position: "asc" as const },
        select: {
          id: true,
          kind: true,
          position: true,
          etsyRemoteId: true,
          etsySyncedAt: true,
          asset: {
            select: {
              id: true,
              role: true,
              fileName: true,
              blobUrl: true,
              pathname: true,
              contentType: true,
              byteSize: true,
            },
          },
        },
      },
    },
  },
} as const;

export async function findWarlockProduct(selector: WarlockProductSelector): Promise<WarlockProductManifest | null> {
  if (selector.productId) {
    return prisma.spellmarkProduct.findUnique({
      where: { id: selector.productId },
      select: selection,
    }) as Promise<WarlockProductManifest | null>;
  }

  if (!selector.title) return null;
  const matches = await prisma.spellmarkProduct.findMany({
    where: { title: selector.title },
    select: selection,
    take: 2,
  });
  if (matches.length > 1) throw new Error("warlock_product_title_ambiguous");
  return (matches[0] ?? null) as WarlockProductManifest | null;
}
