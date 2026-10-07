import { NextRequest, NextResponse } from "next/server";
import { verifyArtistSession } from "../../../../lib/museum-artist-auth";
import { prisma } from "../../../../lib/prisma";
import { deleteGrottoImages, storeGrottoImage } from "../../../../lib/grotto-blob";
import { MAX_GROTTO_IMAGES } from "../../../../lib/grotto-capacity";
import { Prisma } from "../../../generated/prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLLECTIONS = new Set(["all", "favorites", "recent"]);

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

  const collection = request.nextUrl.searchParams.get("collection")?.trim().toLowerCase() || "all";
  if (!COLLECTIONS.has(collection)) {
    return NextResponse.json({ error: "That Grotto collection is not available." }, { status: 400 });
  }

  const requestedLimit = Number(request.nextUrl.searchParams.get("limit") || 16);
  const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 16, 1), 48);

  const offset = Math.max(0, Math.min(100000, Math.floor(Number(request.nextUrl.searchParams.get("offset")) || 0)));
  if (collection === "recent" && offset >= 48) return NextResponse.json([]);
  const images = await prisma.grottoImage.findMany({
    where: { ...(collection === "favorites" ? { favorite: true } : {}), deletedAt: null },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: collection === "recent" ? Math.min(limit, 48 - offset) : limit,
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
    studioInput: studioInputFromRecipe(image.recipeJson),
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
    const museId = "studio";
    const blob = await storeGrottoImage(museId, bytes, contentType);
    let image;
    try {
      image = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(907300)::text`);
        const count = await tx.grottoImage.count({ where: { deletedAt: null } });
        if (count >= MAX_GROTTO_IMAGES) throw new Error(`The Grotto is limited to ${MAX_GROTTO_IMAGES} images. Delete images before uploading more.`);
        return tx.grottoImage.create({ data: { museId, provider: "reference", contentType, blobUrl: blob.url, byteSize: bytes.length }, select: { id: true, museId: true } });
      }, { maxWait: 10_000, timeout: 20_000 });
    } catch (error) {
      await deleteGrottoImages([blob.url]).catch(() => undefined);
      throw error;
    }
    return NextResponse.json({ id: image.id, museId: image.museId, src: `/api/grotto/images/${image.id}/file`, favorite: false, canonical: false, provider: "reference" }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Reference could not be uploaded." }, { status: 400 }); }
}
