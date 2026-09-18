import { NextRequest, NextResponse } from "next/server";
import { deleteGrottoImages, grottoBlobConfigured, storeGrottoImage } from "../../../../../lib/grotto-blob";
import { verifyArtistSession } from "../../../../../lib/museum-artist-auth";
import { prisma } from "../../../../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  if (!verifyArtistSession(request)) return NextResponse.json({ error: "Artist session required." }, { status: 401 });
  if (request.headers.get("origin") && request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Same-origin migration required." }, { status: 403 });
  if (!grottoBlobConfigured()) return NextResponse.json({ error: "Vercel Blob is not configured." }, { status: 503 });

  await prisma.grottoImage.updateMany({ where: { deletedAt: { not: null }, imageData: { not: null } }, data: { imageData: null } });
  const images = await prisma.grottoImage.findMany({
    where: { deletedAt: null, imageData: { not: null }, blobUrl: null },
    orderBy: { createdAt: "asc" },
    take: 4,
    select: { id: true, museId: true, imageData: true, contentType: true },
  });

  let migrated = 0;
  for (const image of images) {
    if (!image.imageData) continue;
    const blob = await storeGrottoImage(image.museId, Buffer.from(image.imageData), image.contentType);
    try {
      await prisma.grottoImage.update({ where: { id: image.id }, data: { blobUrl: blob.url, imageData: null } });
      migrated += 1;
    } catch (error) {
      await deleteGrottoImages([blob.url]).catch(() => undefined);
      throw error;
    }
  }

  const remaining = await prisma.grottoImage.count({ where: { deletedAt: null, imageData: { not: null }, blobUrl: null } });
  return NextResponse.json({ migrated, remaining, complete: remaining === 0 });
}
