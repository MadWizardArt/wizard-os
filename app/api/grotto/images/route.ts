import { NextRequest, NextResponse } from "next/server";
import { verifyArtistSession } from "../../../../lib/museum-artist-auth";
import { prisma } from "../../../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_GALLERIES = new Set(["tessa", "studio"]);

function studioInputFromRecipe(recipeJson: string) {
  try {
    const parsed = JSON.parse(recipeJson) as { studio?: unknown };
    return parsed.studio ?? null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  if (!verifyArtistSession(request)) {
    return NextResponse.json({ error: "Artist session required." }, { status: 401 });
  }

  const museId = request.nextUrl.searchParams.get("museId")?.trim().toLowerCase() || "tessa";
  if (!ALLOWED_GALLERIES.has(museId)) {
    return NextResponse.json({ error: "That Grotto gallery is not available yet." }, { status: 400 });
  }

  const requestedLimit = Number(request.nextUrl.searchParams.get("limit") || 16);
  const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 16, 1), 48);

  const images = await prisma.grottoImage.findMany({
    where: { museId, deletedAt: null },
    orderBy: [{ favorite: "desc" }, { createdAt: "desc" }],
    take: limit,
    select: {
      id: true,
      museId: true,
      favorite: true,
      canonical: true,
      provider: true,
      prompt: true,
      recipeJson: true,
      createdAt: true,
    },
  });

  return NextResponse.json(images.map((image) => ({
    id: image.id,
    museId: image.museId,
    favorite: image.favorite,
    canonical: image.canonical,
    provider: image.provider,
    prompt: image.prompt,
    studioInput: image.museId === "studio" ? studioInputFromRecipe(image.recipeJson) : null,
    createdAt: image.createdAt,
    src: `/api/grotto/images/${image.id}/file`,
  })));
}
