import { NextRequest, NextResponse } from "next/server";
import { verifyArtistSession } from "../../../../lib/museum-artist-auth";
import { prisma } from "../../../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!verifyArtistSession(request)) {
    return NextResponse.json({ error: "Artist session required." }, { status: 401 });
  }

  const museId = request.nextUrl.searchParams.get("museId")?.trim().toLowerCase() || "tessa";
  if (museId !== "tessa") {
    return NextResponse.json({ error: "That Grotto chamber is not available yet." }, { status: 400 });
  }

  const requestedLimit = Number(request.nextUrl.searchParams.get("limit") || 15);
  const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 15, 1), 48);

  const images = await prisma.grottoImage.findMany({
    where: { museId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      museId: true,
      favorite: true,
      canonical: true,
      provider: true,
      createdAt: true,
    },
  });

  return NextResponse.json(images.map((image) => ({
    ...image,
    src: `/api/grotto/images/${image.id}/file`,
  })));
}
