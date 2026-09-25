import { NextRequest, NextResponse } from "next/server";
import { verifyArtistSession } from "../../../../../lib/museum-artist-auth";
import { prisma } from "../../../../../lib/prisma";
import { readProduct, sameOrigin } from "../../../../../lib/warlock-products";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
type Context = { params: Promise<{ id: string }> };
export async function PATCH(request: NextRequest, context: Context) {
  if (!verifyArtistSession(request)) return NextResponse.json({ error: "artist_session_required" }, { status: 401, headers });
  if (!sameOrigin(request)) return NextResponse.json({ error: "cross_origin_request" }, { status: 403, headers });
  const input = readProduct(await request.json().catch(() => null));
  if (!input) return NextResponse.json({ error: "invalid_product" }, { status: 400, headers });
  const { id } = await context.params;
  if (!/^[a-z0-9]{15,40}$/.test(id)) return NextResponse.json({ error: "invalid_id" }, { status: 400, headers });
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
