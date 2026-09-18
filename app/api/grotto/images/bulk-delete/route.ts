import { NextRequest, NextResponse } from "next/server";
import { verifyArtistSession } from "../../../../../lib/museum-artist-auth";
import { prisma } from "../../../../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!verifyArtistSession(request)) return NextResponse.json({ error: "Artist session required." }, { status: 401 });
  if (request.headers.get("origin") && request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Same-origin change required." }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const candidateIds: string[] = Array.isArray(body.ids) ? body.ids.filter((id: unknown): id is string => typeof id === "string" && id.length > 0) : [];
  const ids: string[] = [...new Set(candidateIds)].slice(0, 200);
  if (!ids.length) return NextResponse.json({ error: "Select at least one image." }, { status: 400 });
  const protectedCount = await prisma.grottoImage.count({ where: { id: { in: ids }, canonical: true, deletedAt: null } });
  if (protectedCount) return NextResponse.json({ error: "Canon stays protected." }, { status: 409 });
  const result = await prisma.grottoImage.updateMany({ where: { id: { in: ids }, deletedAt: null, canonical: false }, data: { deletedAt: new Date() } });
  return NextResponse.json({ deleted: result.count });
}
