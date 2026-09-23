import { NextRequest, NextResponse } from "next/server";
import { verifyArtistSession } from "../../../../lib/museum-artist-auth";
import { prisma } from "../../../../lib/prisma";
import { readProduct, sameOrigin } from "../../../../lib/warlock-products";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const unauth = () => NextResponse.json({ error: "artist_session_required" }, { status: 401, headers });

export async function GET(request: NextRequest) {
  if (!verifyArtistSession(request)) return unauth();
  try {
    const products = await prisma.spellmarkProduct.findMany({
      orderBy: { updatedAt: "desc" },
      take: 150,
      include: { variants: { orderBy: { createdAt: "asc" } } },
    });
    return NextResponse.json({ products }, { headers });
  } catch {
    return NextResponse.json({ error: "spellmark_products_unavailable" }, { status: 503, headers });
  }
}
export async function POST(request: NextRequest) {
  if (!verifyArtistSession(request)) return unauth();
  if (!sameOrigin(request)) return NextResponse.json({ error: "cross_origin_request" }, { status: 403, headers });
  const input = readProduct(await request.json().catch(() => null));
  if (!input) return NextResponse.json({ error: "invalid_product" }, { status: 400, headers });
  try {
    const product = await prisma.spellmarkProduct.create({ data: input, include: { variants: true } });
    return NextResponse.json({ product }, { status: 201, headers });
  } catch {
    return NextResponse.json({ error: "spellmark_product_save_failed" }, { status: 503, headers });
  }
}
