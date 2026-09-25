import { NextRequest, NextResponse } from "next/server";
import { verifyArtistSession } from "../../../../../../lib/museum-artist-auth";
import { prisma } from "../../../../../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!verifyArtistSession(request)) {
    return NextResponse.json({ error: "artist_session_required" }, { status: 401 });
  }
  const { id } = await context.params;
  if (!/^[a-z0-9]{15,40}$/.test(id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }
  const assets = await prisma.spellmarkAsset.findMany({
    where: { productId: id },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json({ assets }, { headers: { "Cache-Control": "private, no-store" } });
}
