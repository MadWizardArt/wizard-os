import { get } from "@vercel/blob";
import { etsyHeaders } from "../etsy-client";
import { getWarlockEtsyOperatorContext } from "../warlock-auth";
import { prisma } from "../prisma";
import type {
  WarlockManifestListing,
  WarlockManifestListingAsset,
  WarlockManifestVariant,
  WarlockProductManifest,
} from "../warlock-mcp/manifest.ts";
import { ensureEtsyAiDisclosure } from "./policy.ts";
import { assertCommerceDraftWritesEnabled } from "./write-guard.ts";

const ETSY_API = "https://api.etsy.com/v3/application";
const EDITION_PROPERTY_ID = 513;
const EDITION_PROPERTY_NAME = "Edition";

type Json = Record<string, unknown>;

export type EtsyDraftExecutionResult = {
  productId: string;
  listings: Array<{
    fulfillment: "DIGITAL" | "PHYSICAL";
    listingId: string;
    created: boolean;
    metadataUpdated: boolean;
    inventoryUpdated: boolean;
    assetsUploaded: number;
    assetsSkipped: number;
  }>;
};

function parseTags(tagsJson: string) {
  try {
    const tags = JSON.parse(tagsJson);
    return Array.isArray(tags)
      ? tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 13)
      : [];
  } catch {
    return [];
  }
}

export function etsySkuForVariant(variant: WarlockManifestVariant) {
  if (variant.etsySku?.trim()) return variant.etsySku.trim();
  const compact = variant.id.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return ("SM-" + compact).slice(0, 32);
}

function listingVariants(
  manifest: WarlockProductManifest,
  fulfillment: "DIGITAL" | "PHYSICAL",
) {
  return manifest.variants.filter((variant) => variant.fulfillment === fulfillment);
}

function lowestPriceCents(variants: WarlockManifestVariant[]) {
  const prices = variants
    .map((variant) => variant.retailPriceCents)
    .filter((price): price is number => Number.isSafeInteger(price) && price > 0);
  if (!prices.length) throw new Error("listing_price_missing");
  return Math.min(...prices);
}

function money(cents: number) {
  return (cents / 100).toFixed(2);
}

function listingForm(
  listing: WarlockManifestListing,
  variants: WarlockManifestVariant[],
) {
  if (!listing.taxonomyId) throw new Error("listing_taxonomy_missing");
  const type = listing.fulfillment === "PHYSICAL" ? "physical" : "download";
  const form = new URLSearchParams({
    quantity: String(listing.quantity),
    title: listing.title,
    description: ensureEtsyAiDisclosure(listing.description),
    price: money(lowestPriceCents(variants)),
    who_made: listing.whoMade,
    when_made: listing.whenMade,
    taxonomy_id: String(listing.taxonomyId),
    is_supply: String(listing.isSupply),
    should_auto_renew: String(listing.shouldAutoRenew),
    type,
  });
  const tags = parseTags(listing.tagsJson);
  if (tags.length) form.set("tags", tags.join(","));

  if (listing.fulfillment === "PHYSICAL") {
    if (!listing.shippingProfileId || !listing.readinessStateId) {
      throw new Error("physical_profiles_missing");
    }
    form.set("shipping_profile_id", String(listing.shippingProfileId));
    form.set("readiness_state_id", String(listing.readinessStateId));
  }
  return form;
}

async function etsyJson(
  accessToken: string,
  path: string,
  init: RequestInit = {},
) {
  const response = await fetch(ETSY_API + path, {
    ...init,
    headers: {
      ...etsyHeaders(accessToken),
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({})) as Json;
  if (!response.ok) {
    const error = new Error("etsy_http_" + response.status);
    Object.assign(error, { status: response.status, payload });
    throw error;
  }
  return payload;
}

async function ensureDraftListing(
  accessToken: string,
  shopId: number,
  listing: WarlockManifestListing,
  variants: WarlockManifestVariant[],
) {
  const form = listingForm(listing, variants);

  if (listing.etsyListingId) {
    const existing = await etsyJson(
      accessToken,
      "/listings/" + listing.etsyListingId,
    );
    if (String(existing.state ?? "") !== "draft") {
      throw new Error("etsy_listing_not_draft");
    }

    const updateForm = new URLSearchParams(form);
    updateForm.delete("type");
    await etsyJson(
      accessToken,
      "/shops/" + shopId + "/listings/" + listing.etsyListingId,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/x-www-form-urlencoded; charset=utf-8" },
        body: updateForm,
      },
    );
    return { listingId: listing.etsyListingId, created: false };
  }

  const suffix = listing.fulfillment === "PHYSICAL" ? "?legacy=false" : "";
  const created = await etsyJson(
    accessToken,
    "/shops/" + shopId + "/listings" + suffix,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=utf-8" },
      body: form,
    },
  );
  const listingId = String(created.listing_id ?? "");
  if (!/^\d+$/.test(listingId)) throw new Error("etsy_listing_id_missing");

  await prisma.spellmarkListing.update({
    where: { id: listing.id },
    data: {
      etsyListingId: listingId,
      status: "DRAFT_CREATED",
      lastDraftSyncAt: new Date(),
    },
  });
  return { listingId, created: true };
}

async function updatePhysicalInventory(
  accessToken: string,
  listingId: string,
  listing: WarlockManifestListing,
  variants: WarlockManifestVariant[],
) {
  if (!listing.readinessStateId) throw new Error("readiness_state_missing");
  if (!variants.length) throw new Error("physical_variants_missing");

  const skuByVariantId = new Map(
    variants.map((variant) => [variant.id, etsySkuForVariant(variant)]),
  );
  const body = {
    products: variants.map((variant) => {
      if (!variant.retailPriceCents) throw new Error("physical_price_missing");
      return {
        sku: skuByVariantId.get(variant.id),
        offerings: [{
          quantity: listing.quantity,
          price: money(variant.retailPriceCents),
          is_enabled: true,
          readiness_state_id: listing.readinessStateId,
        }],
        property_values: [{
          property_id: EDITION_PROPERTY_ID,
          property_name: EDITION_PROPERTY_NAME,
          scale_id: null,
          value_ids: [],
          values: [variant.label],
        }],
      };
    }),
    price_on_property: [EDITION_PROPERTY_ID],
    quantity_on_property: [],
    sku_on_property: [EDITION_PROPERTY_ID],
    readiness_state_on_property: [],
  };

  const inventory = await etsyJson(
    accessToken,
    "/listings/" + listingId + "/inventory?legacy=false",
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  const products = Array.isArray(inventory.products)
    ? inventory.products as Json[]
    : [];

  for (const variant of variants) {
    const sku = skuByVariantId.get(variant.id)!;
    const remote = products.find((product) => String(product.sku ?? "") === sku);
    await prisma.spellmarkVariant.update({
      where: { id: variant.id },
      data: {
        etsyListingId: listingId,
        etsySku: sku,
        ...(remote?.product_id ? { etsyProductId: String(remote.product_id) } : {}),
      },
    });
  }
  return inventory;
}

async function privateAssetFile(link: WarlockManifestListingAsset) {
  const result = await get(link.asset.blobUrl, { access: "private" });
  if (!result || result.statusCode !== 200) throw new Error("listing_asset_blob_missing");
  const blob = await new Response(result.stream).blob();
  const bytes = await blob.arrayBuffer();
  return new File([bytes], link.asset.fileName, {
    type: link.asset.contentType || "application/octet-stream",
  });
}

async function uploadListingAsset(
  accessToken: string,
  shopId: number,
  listingId: string,
  link: WarlockManifestListingAsset,
) {
  if (link.etsyRemoteId) return { uploaded: false, remoteId: link.etsyRemoteId };

  const file = await privateAssetFile(link);
  const form = new FormData();
  let path: string;

  if (link.kind === "image") {
    form.set("image", file, file.name);
    form.set("rank", String(link.position));
    path = "/shops/" + shopId + "/listings/" + listingId + "/images";
  } else if (link.kind === "customer_file") {
    form.set("file", file, file.name);
    form.set("name", file.name);
    form.set("rank", String(link.position));
    path = "/shops/" + shopId + "/listings/" + listingId + "/files";
  } else {
    throw new Error("unsupported_listing_asset_kind");
  }

  const payload = await etsyJson(accessToken, path, {
    method: "POST",
    body: form,
  });

  const remoteId = String(
    link.kind === "image"
      ? payload.listing_image_id ?? ""
      : payload.listing_file_id ?? "",
  );
  if (!/^\d+$/.test(remoteId)) throw new Error("etsy_asset_id_missing");

  await prisma.spellmarkListingAsset.update({
    where: { id: link.id },
    data: { etsyRemoteId: remoteId, etsySyncedAt: new Date() },
  });

  return { uploaded: true, remoteId };
}

export async function executeEtsyDrafts(
  manifest: WarlockProductManifest,
): Promise<EtsyDraftExecutionResult> {
  assertCommerceDraftWritesEnabled();

  const { auth, shopId } = await getWarlockEtsyOperatorContext();
  const results: EtsyDraftExecutionResult["listings"] = [];

  for (const listing of manifest.listings) {
    const variants = listingVariants(manifest, listing.fulfillment);
    if (!variants.length) continue;
    if (listing.fulfillment === "DIGITAL" && variants.length !== 1) {
      throw new Error("digital_listing_requires_single_variant");
    }

    const ensured = await ensureDraftListing(
      auth.session.access_token,
      shopId,
      listing,
      variants,
    );

    let inventoryUpdated = false;
    if (listing.fulfillment === "PHYSICAL") {
      await updatePhysicalInventory(
        auth.session.access_token,
        ensured.listingId,
        listing,
        variants,
      );
      inventoryUpdated = true;
    } else {
      await prisma.spellmarkVariant.update({
        where: { id: variants[0].id },
        data: {
          etsyListingId: ensured.listingId,
          etsySku: etsySkuForVariant(variants[0]),
        },
      });
    }

    let assetsUploaded = 0;
    let assetsSkipped = 0;
    for (const link of [...listing.assets].sort((a, b) => a.position - b.position)) {
      const outcome = await uploadListingAsset(
        auth.session.access_token,
        shopId,
        ensured.listingId,
        link,
      );
      if (outcome.uploaded) assetsUploaded += 1;
      else assetsSkipped += 1;
    }

    await prisma.spellmarkListing.update({
      where: { id: listing.id },
      data: {
        etsyListingId: ensured.listingId,
        status: "DRAFT_CREATED",
        lastDraftSyncAt: new Date(),
      },
    });

    results.push({
      fulfillment: listing.fulfillment,
      listingId: ensured.listingId,
      created: ensured.created,
      metadataUpdated: true,
      inventoryUpdated,
      assetsUploaded,
      assetsSkipped,
    });
  }

  return { productId: manifest.id, listings: results };
}
