import type {
  WarlockManifestVariant,
  WarlockProductManifest,
} from "../warlock-mcp/manifest.ts";
import { prisma } from "../prisma";
import { createTemporaryPrintfulAssetUrl } from "./asset-delivery.ts";
import { etsySkuForVariant } from "./etsy-draft-executor.ts";
import { assertCommerceDraftWritesEnabled } from "./write-guard.ts";

const API = "https://api.printful.com";

type Json = Record<string, unknown>;

export type PrintfulSyncResult = {
  productId: string;
  state: "SKIPPED" | "WAITING_PRINTFUL_IMPORT" | "SYNCED";
  etsyListingId?: string;
  printfulSyncProductId?: number;
  variants?: Array<{
    variantId: string;
    printfulSyncVariantId: number;
    printfulVariantId: number;
  }>;
};

function positiveId(value: unknown) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

function token() {
  const value = process.env.PRINTFUL_PRIVATE_TOKEN?.trim();
  if (!value) throw new Error("printful_token_missing");
  return value;
}

async function request(
  path: string,
  storeId: number,
  init: RequestInit = {},
  allow404 = false,
) {
  const response = await fetch(API + path, {
    ...init,
    headers: {
      Authorization: "Bearer " + token(),
      "X-PF-Language": "en_US",
      "X-PF-Store-Id": String(storeId),
      ...(init.headers ?? {}),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (allow404 && response.status === 404) return null;
  const payload = await response.json().catch(() => ({})) as Json;
  if (!response.ok) {
    const error = new Error("printful_http_" + response.status);
    Object.assign(error, { status: response.status, payload });
    throw error;
  }
  return payload;
}

function syncVariantsFrom(payload: Json) {
  const result = payload.result;
  if (!result || typeof result !== "object" || Array.isArray(result)) return [];
  const variants = (result as Json).sync_variants;
  return Array.isArray(variants) ? variants.filter((v): v is Json => Boolean(v && typeof v === "object")) : [];
}

function syncProductIdFrom(payload: Json) {
  const result = payload.result;
  if (!result || typeof result !== "object" || Array.isArray(result)) return null;
  const row = result as Json;
  const nested = row.sync_product;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return positiveId((nested as Json).id);
  }
  return positiveId(row.id);
}

function matchSyncVariant(
  canonical: WarlockManifestVariant,
  candidates: Json[],
) {
  if (canonical.printfulSyncVariantId) {
    const byKnownId = candidates.find(
      (candidate) => positiveId(candidate.id) === canonical.printfulSyncVariantId,
    );
    if (byKnownId) return byKnownId;
  }

  if (canonical.etsyProductId) {
    const byExternalId = candidates.find(
      (candidate) => String(candidate.external_id ?? "") === canonical.etsyProductId,
    );
    if (byExternalId) return byExternalId;
  }

  const sku = etsySkuForVariant(canonical);
  return candidates.find((candidate) => String(candidate.sku ?? "") === sku) ?? null;
}

export async function syncPhysicalListingToPrintful(
  manifest: WarlockProductManifest,
): Promise<PrintfulSyncResult> {
  assertCommerceDraftWritesEnabled();

  const physical = manifest.variants.filter((variant) => variant.fulfillment === "PHYSICAL");
  if (!physical.length) return { productId: manifest.id, state: "SKIPPED" };

  const listing = manifest.listings.find((candidate) => candidate.fulfillment === "PHYSICAL");
  if (!listing?.etsyListingId) throw new Error("physical_etsy_draft_missing");

  const storeIds = [...new Set(
    physical
      .map((variant) => variant.printfulStoreId)
      .filter((id): id is number => Boolean(id)),
  )];
  if (storeIds.length !== 1) throw new Error("physical_printful_store_mismatch");
  const storeId = storeIds[0];

  const imported = await request(
    "/sync/products/@" + encodeURIComponent(listing.etsyListingId),
    storeId,
    {},
    true,
  );
  if (!imported) {
    await prisma.spellmarkListing.update({
      where: { id: listing.id },
      data: { status: "WAITING_PRINTFUL" },
    });
    return {
      productId: manifest.id,
      state: "WAITING_PRINTFUL_IMPORT",
      etsyListingId: listing.etsyListingId,
    };
  }

  const syncProductId = syncProductIdFrom(imported);
  if (!syncProductId) throw new Error("printful_sync_product_id_missing");
  const candidates = syncVariantsFrom(imported);

  const master = manifest.assets.find((asset) => asset.role === "master");
  if (!master) throw new Error("master_missing");

  const updated: NonNullable<PrintfulSyncResult["variants"]> = [];
  for (const variant of physical) {
    if (!variant.printfulVariantId) throw new Error("printful_variant_mapping_missing");
    if (!variant.retailPriceCents) throw new Error("retail_price_missing");

    const remote = matchSyncVariant(variant, candidates);
    const syncVariantId = positiveId(remote?.id);
    if (!syncVariantId) {
      throw new Error("printful_sync_variant_not_found:" + variant.id);
    }

    const temporary = await createTemporaryPrintfulAssetUrl(master);
    const sku = etsySkuForVariant(variant);
    await request(
      "/sync/variant/" + syncVariantId,
      storeId,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          variant_id: variant.printfulVariantId,
          retail_price: (variant.retailPriceCents / 100).toFixed(2),
          sku,
          is_ignored: false,
          files: [{
            type: "default",
            url: temporary.url,
            filename: master.fileName,
            visible: true,
          }],
        }),
      },
    );

    await prisma.spellmarkVariant.update({
      where: { id: variant.id },
      data: {
        printfulSyncVariantId: syncVariantId,
        etsySku: sku,
      },
    });
    updated.push({
      variantId: variant.id,
      printfulSyncVariantId: syncVariantId,
      printfulVariantId: variant.printfulVariantId,
    });
  }

  await prisma.spellmarkListing.update({
    where: { id: listing.id },
    data: {
      printfulSyncProductId: syncProductId,
      status: "SYNCED",
      lastDraftSyncAt: new Date(),
    },
  });

  return {
    productId: manifest.id,
    state: "SYNCED",
    etsyListingId: listing.etsyListingId,
    printfulSyncProductId: syncProductId,
    variants: updated,
  };
}
