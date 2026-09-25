import { NextRequest, NextResponse } from "next/server";
import { verifyArtistSession } from "../../../../../../lib/museum-artist-auth";
import { prisma } from "../../../../../../lib/prisma";
import {
  fulfillmentEnum,
  readListingAssets,
  readListingManifest,
} from "../../../../../../lib/warlock-listings";
import { sameOrigin } from "../../../../../../lib/warlock-products";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store" };
type Context = { params: Promise<{ id: string }> };

function validProductId(id: string) {
  return /^[a-z0-9]{15,40}$/.test(id);
}

const include = {
  assets: {
    orderBy: [{ kind: "asc" as const }, { position: "asc" as const }],
    include: {
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
} as const;

export async function GET(request: NextRequest, context: Context) {
  if (!verifyArtistSession(request)) {
    return NextResponse.json({ error: "artist_session_required" }, { status: 401, headers });
  }
  const { id: productId } = await context.params;
  if (!validProductId(productId)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400, headers });
  }

  const listings = await prisma.spellmarkListing.findMany({
    where: { productId },
    orderBy: { fulfillment: "asc" },
    include,
  });
  return NextResponse.json({
    listings: listings.map((listing) => ({
      ...listing,
      tags: JSON.parse(listing.tagsJson),
    })),
  }, { headers });
}

export async function PUT(request: NextRequest, context: Context) {
  if (!verifyArtistSession(request)) {
    return NextResponse.json({ error: "artist_session_required" }, { status: 401, headers });
  }
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "cross_origin_request" }, { status: 403, headers });
  }

  const { id: productId } = await context.params;
  if (!validProductId(productId)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400, headers });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "invalid_listing_manifest" }, { status: 400, headers });
  }

  const raw = body as Record<string, unknown>;
  const listingInput = readListingManifest(raw.listing);
  if (!listingInput) {
    return NextResponse.json({ error: "invalid_listing_manifest" }, { status: 400, headers });
  }

  const shouldReplaceAssets = raw.assets !== undefined;
  const assetInputs = shouldReplaceAssets ? readListingAssets(raw.assets) : [];
  if (shouldReplaceAssets && !assetInputs) {
    return NextResponse.json({ error: "invalid_listing_assets" }, { status: 400, headers });
  }
  if (
    listingInput.fulfillment === "PHYSICAL" &&
    assetInputs?.some((asset) => asset.kind === "customer_file")
  ) {
    return NextResponse.json({ error: "physical_listing_cannot_have_customer_files" }, { status: 400, headers });
  }

  try {
    const product = await prisma.spellmarkProduct.findUnique({
      where: { id: productId },
      select: { id: true },
    });
    if (!product) {
      return NextResponse.json({ error: "product_not_found" }, { status: 404, headers });
    }

    if (shouldReplaceAssets && assetInputs?.length) {
      const owned = await prisma.spellmarkAsset.findMany({
        where: { productId, id: { in: assetInputs.map((asset) => asset.assetId) } },
        select: { id: true },
      });
      if (owned.length !== assetInputs.length) {
        return NextResponse.json({ error: "listing_asset_not_owned_by_product" }, { status: 400, headers });
      }
    }

    const fulfillment = fulfillmentEnum(listingInput.fulfillment);
    const listing = await prisma.$transaction(async (tx) => {
      const saved = await tx.spellmarkListing.upsert({
        where: { productId_fulfillment: { productId, fulfillment } },
        create: {
          productId,
          fulfillment,
          title: listingInput.title,
          description: listingInput.description,
          tagsJson: JSON.stringify(listingInput.tags),
          taxonomyId: listingInput.taxonomyId,
          shippingProfileId: listingInput.shippingProfileId,
          readinessStateId: listingInput.readinessStateId,
          quantity: listingInput.quantity,
          whoMade: listingInput.whoMade,
          whenMade: listingInput.whenMade,
          isSupply: listingInput.isSupply,
          shouldAutoRenew: listingInput.shouldAutoRenew,
          status: listingInput.status,
        },
        update: {
          title: listingInput.title,
          description: listingInput.description,
          tagsJson: JSON.stringify(listingInput.tags),
          taxonomyId: listingInput.taxonomyId,
          shippingProfileId: listingInput.shippingProfileId,
          readinessStateId: listingInput.readinessStateId,
          quantity: listingInput.quantity,
          whoMade: listingInput.whoMade,
          whenMade: listingInput.whenMade,
          isSupply: listingInput.isSupply,
          shouldAutoRenew: listingInput.shouldAutoRenew,
          status: listingInput.status,
        },
      });

      if (shouldReplaceAssets) {
        await tx.spellmarkListingAsset.deleteMany({ where: { listingId: saved.id } });
        if (assetInputs?.length) {
          await tx.spellmarkListingAsset.createMany({
            data: assetInputs.map((asset) => ({
              listingId: saved.id,
              assetId: asset.assetId,
              kind: asset.kind,
              position: asset.position,
            })),
          });
        }
      }

      return tx.spellmarkListing.findUniqueOrThrow({
        where: { id: saved.id },
        include,
      });
    });

    return NextResponse.json({
      listing: {
        ...listing,
        tags: JSON.parse(listing.tagsJson),
      },
    }, { headers });
  } catch (error) {
    console.error("Spellmark listing manifest save failed", error);
    return NextResponse.json({ error: "listing_manifest_save_failed" }, { status: 503, headers });
  }
}
