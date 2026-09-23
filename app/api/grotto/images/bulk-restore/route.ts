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
  if (!ids.length || ids.length > 200 || ids.some((id) => typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(id)) || new Set(ids).size !== ids.length) {
    return NextResponse.json({ error: "Select between 1 and 200 distinct images." }, { status: 400 });
  }

  const retentionCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const restored = await prisma.grottoImage.updateMany({
    where: { id: { in: ids }, deletedAt: { gte: retentionCutoff }, canonical: false, provider: { not: "header" } },
    data: { deletedAt: null },
  });
  if (restored.count !== ids.length) {
    return NextResponse.json({ restored: restored.count, error: "Some images were already restored or their retention period expired." }, { status: 409 });
  }
  return NextResponse.json({ restored: restored.count });
}
