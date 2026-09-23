import { NextRequest, NextResponse } from "next/server";
import { verifyArtistSession } from "../../../../../lib/museum-artist-auth";
import { prisma } from "../../../../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DESTINATIONS = new Set(["studio", "novy", "aurelia", "callista", "cleo", "lyra", "melina", "seraphine", "tessa", "thalia"]);

export async function POST(request: NextRequest) {
  if (!verifyArtistSession(request)) return NextResponse.json({ error: "Artist session required." }, { status: 401 });
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "Same-origin change required." }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body.ids) ? body.ids : [];
  const destination = body.destination;
  if (!ids.length || ids.length > 200 || ids.some((id) => typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(id)) || new Set(ids).size !== ids.length) {
    return NextResponse.json({ error: "Select between 1 and 200 distinct images." }, { status: 400 });
  }
  if (typeof destination !== "string" || !DESTINATIONS.has(destination)) {
    return NextResponse.json({ error: "Choose an Atelier or Muse gallery destination." }, { status: 400 });
  }

  try {
    const moved = await prisma.$transaction(async (tx) => {
      const images = await tx.grottoImage.findMany({
        where: { id: { in: ids }, deletedAt: null, canonical: false, provider: { not: "header" } },
        select: { id: true },
      });
      if (images.length !== ids.length) return null; // Fail closed: no partial moves or canonical/header changes.
      const result = await tx.grottoImage.updateMany({
        where: { id: { in: ids }, deletedAt: null, canonical: false, provider: { not: "header" } },
        data: { museId: destination },
      });
      if (result.count !== ids.length) throw new Error("A selected image changed during the move.");
      return result.count;
    });
    if (moved === null) return NextResponse.json({ error: "One or more images are missing or protected. Nothing was moved." }, { status: 409 });
    // Changing gallery membership never relocates Blob files, duplicates images or changes favorites, prompts or recipes.
    return NextResponse.json({ moved, destination });
  } catch {
    return NextResponse.json({ error: "Images could not be moved. No changes were saved." }, { status: 409 });
  }
}
