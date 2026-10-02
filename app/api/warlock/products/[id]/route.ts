import { del } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { verifyArtistSession } from "../../../../../lib/museum-artist-auth";
import { prisma } from "../../../../../lib/prisma";
import { readProduct, sameOrigin } from "../../../../../lib/warlock-products";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
type Context = { params: Promise<{ id: string }> };

function validId(id: string) {
  return /^[a-z0-9]{15,40}$/.test(id);
}

export async function PATCH(request: NextRequest, context: Context) {
  if (!verifyArtistSession(request)) return NextResponse.json({ error: "artist_session_required" }, { status: 401, headers });
  if (!sameOrigin(request)) return NextResponse.json({ error: "cross_origin_request" }, { status: 403, headers });
  const input = readProduct(await request.json().catch(() => null));
  if (!input) return NextResponse.json({ error: "invalid_product" }, { status: 400, headers });
  const { id } = await context.params;
  if (!validId(id)) return NextResponse.json({ error: "invalid_id" }, { status: 400, headers });
  try {
    const product = await prisma.spellmarkProduct.update({
      where: { id }, data: input, include: {
      variants: { orderBy: { createdAt: "asc" } },
      listings: { orderBy: { fulfillment: "asc" } },
    },
    });
    return NextResponse.json({ product }, { headers });
  } catch {
    return NextResponse.json({ error: "product_not_found_or_unavailable" }, { status: 404, headers });
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  if (!verifyArtistSession(request)) return NextResponse.json({ error: "artist_session_required" }, { status: 401, headers });
  if (!sameOrigin(request)) return NextResponse.json({ error: "cross_origin_request" }, { status: 403, headers });
  const { id } = await context.params;
  if (!validId(id)) return NextResponse.json({ error: "invalid_id" }, { status: 400, headers });

  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "SpellmarkProduct" WHERE "id" = ${id} FOR UPDATE`;
      const product = await tx.spellmarkProduct.findUnique({
        where: { id },
        include: {
          assets: { select: { blobUrl: true } },
          listings: { select: { etsyListingId: true, printfulSyncProductId: true } },
          variants: { select: { etsyListingId: true, etsyProductId: true, printfulSyncVariantId: true } },
        },
      });
      if (!product) throw new Error("product_not_found");
      const hasExternalState =
        product.listings.some((listing) => listing.etsyListingId || listing.printfulSyncProductId) ||
        product.variants.some((variant) => variant.etsyListingId || variant.etsyProductId || variant.printfulSyncVariantId);
      if (hasExternalState) throw new Error("external_product_cleanup_blocked");

      const blobUrls = [...new Set(product.assets.map((asset) => asset.blobUrl).filter(Boolean))];
      if (blobUrls.length) await del(blobUrls);
      await tx.spellmarkProduct.delete({ where: { id } });
      return { id, deletedAssets: blobUrls.length };
    }, { maxWait: 10_000, timeout: 60_000 });

    return NextResponse.json({ ok: true, ...result }, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "product_cleanup_failed";
    const status = message === "product_not_found" ? 404 : message === "external_product_cleanup_blocked" ? 409 : 400;
    return NextResponse.json({ error: message }, { status, headers });
  }
}
