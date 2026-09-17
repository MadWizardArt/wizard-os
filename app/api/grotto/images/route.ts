import { NextRequest, NextResponse } from "next/server";
import { verifyArtistSession } from "../../../../lib/museum-artist-auth";
import { prisma } from "../../../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_GALLERIES = new Set(["studio", "novy", "aurelia", "callista", "cleo", "lyra", "melina", "seraphine", "tessa", "thalia"]);

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

  const offset = Math.max(0, Math.min(100000, Math.floor(Number(request.nextUrl.searchParams.get("offset")) || 0)));
  const images = await prisma.grottoImage.findMany({
    where: { museId, deletedAt: null },
    orderBy: [{ favorite: "desc" }, { createdAt: "desc" }],
    take: limit,
    skip: offset,
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

export async function POST(request: NextRequest) {
  if (!verifyArtistSession(request)) return NextResponse.json({ error: "Artist session required." }, { status: 401 });
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Same-origin upload required." }, { status: 403 });
  if (Number(request.headers.get("content-length")) > 3.5 * 1024 * 1024) return NextResponse.json({ error: "Choose an image under 3 MB." }, { status: 413 });
  try {
    const form = await request.formData();
    const file = form.get("image");
    if (!(file instanceof File) || file.size === 0 || file.size > 3 * 1024 * 1024) return NextResponse.json({ error: "Choose a JPG, PNG, or WebP under 3 MB." }, { status: 400 });
    const bytes = Buffer.from(await file.arrayBuffer());
    const contentType = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? "image/png"
      : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? "image/jpeg"
      : bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP" ? "image/webp" : null;
    if (!contentType) return NextResponse.json({ error: "Choose a JPG, PNG, or WebP image." }, { status: 400 });
    const museId = String(form.get("museId") || "studio").trim().toLowerCase();
    if (!ALLOWED_GALLERIES.has(museId)) return NextResponse.json({ error: "That Grotto gallery is not available." }, { status: 400 });
    const image = await prisma.grottoImage.create({ data: { museId, provider: "reference", contentType, imageData: bytes, byteSize: bytes.length }, select: { id: true, museId: true } });
    return NextResponse.json({ id: image.id, museId: image.museId, src: `/api/grotto/images/${image.id}/file`, favorite: false, canonical: false, provider: "reference" }, { status: 201 });
  } catch { return NextResponse.json({ error: "Reference could not be uploaded." }, { status: 400 }); }
}
