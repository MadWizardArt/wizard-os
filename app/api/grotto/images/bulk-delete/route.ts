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

  try {
    const deleted = await prisma.$transaction(async (tx) => {
      const images = await tx.grottoImage.findMany({
        where: { id: { in: ids }, deletedAt: null, canonical: false, provider: { not: "header" } },
        select: { id: true },
      });
      if (images.length !== ids.length) return null;
      const result = await tx.grottoImage.updateMany({
        where: { id: { in: ids }, deletedAt: null, canonical: false, provider: { not: "header" } },
        data: { deletedAt: new Date() },
      });
      if (result.count !== ids.length) throw new Error("A selected image changed during deletion.");
      return result.count;
    });
    if (deleted === null) return NextResponse.json({ error: "One or more images are missing or protected. Nothing was deleted." }, { status: 409 });
    // Keep the private Blob bytes for Undo; the storage cleanup purges deletions after the retention window.
    return NextResponse.json({ deleted });
  } catch {
    return NextResponse.json({ error: "Selected images could not be deleted. No changes were saved." }, { status: 409 });
  }
}
