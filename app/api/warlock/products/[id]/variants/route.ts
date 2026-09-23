import { NextRequest, NextResponse } from "next/server";
import { verifyArtistSession } from "../../../../../../lib/museum-artist-auth";
import { prisma } from "../../../../../../lib/prisma";
import { readVariant, sameOrigin } from "../../../../../../lib/warlock-products";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
type Context = { params: Promise<{ id: string }> };
export async function POST(request: NextRequest, context: Context) {
  if (!verifyArtistSession(request)) return NextResponse.json({ error: "artist_session_required" }, { status: 401, headers });
  if (!sameOrigin(request)) return NextResponse.json({ error: "cross_origin_request" }, { status: 403, headers });
  const { id: productId } = await context.params;
  if (!/^[a-z0-9]{15,40}$/.test(productId)) return NextResponse.json({ error: "invalid_id" }, { status: 400, headers });
  const input = readVariant(await request.json().catch(() => null));
  if (!input) return NextResponse.json({ error: "invalid_variant" }, { status: 400, headers });
  try {
    const product = await prisma.spellmarkProduct.findUnique({ where: { id: productId }, select: { id: true } });
    if (!product) return NextResponse.json({ error: "product_not_found" }, { status: 404, headers });
    if (input.printfulVariantId) {
      const existing = await prisma.spellmarkVariant.findFirst({ where: { productId, printfulVariantId: input.printfulVariantId } });
      if (existing) return NextResponse.json({ error: "variant_already_linked_to_product" }, { status: 409, headers });
    }
    const variant = await prisma.spellmarkVariant.create({ data: { ...input, productId } });
    return NextResponse.json({ variant }, { status: 201, headers });
  } catch {
    return NextResponse.json({ error: "spellmark_variant_save_failed" }, { status: 503, headers });
  }
}
