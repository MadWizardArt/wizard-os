import { NextRequest, NextResponse } from "next/server";
import { verifyArtistSession } from "../../../../../lib/museum-artist-auth";
import { prisma } from "../../../../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!verifyArtistSession(request)) return NextResponse.json({ error: "Artist session required." }, { status: 401 });
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "Same-origin change required." }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body.ids) ? body.ids : [];
  const favorite = body.favorite;
  if (!ids.length || ids.length > 200 || ids.some((id) => typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(id)) || new Set(ids).size !== ids.length) {
    return NextResponse.json({ error: "Select between 1 and 200 distinct images." }, { status: 400 });
  }
  if (typeof favorite !== "boolean") return NextResponse.json({ error: "Choose Favorite or Unfavorite." }, { status: 400 });

  const changed = await prisma.$transaction(async (tx) => {
    const images = await tx.grottoImage.findMany({ where: { id: { in: ids }, deletedAt: null }, select: { id: true } });
    if (images.length !== ids.length) return null;
    return tx.grottoImage.updateMany({ where: { id: { in: ids }, deletedAt: null }, data: { favorite } });
  });
  if (!changed || changed.count !== ids.length) return NextResponse.json({ error: "One or more images changed. Nothing was updated." }, { status: 409 });
  return NextResponse.json({ changed: changed.count, favorite });
}
