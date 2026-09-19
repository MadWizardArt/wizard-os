import { NextRequest, NextResponse } from "next/server";
import { deleteGrottoImages, grottoBlobConfigured, inspectGrottoImage, migrateGrottoImage } from "../../../../../lib/grotto-blob";
import { verifyArtistSession } from "../../../../../lib/museum-artist-auth";
import { prisma } from "../../../../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function migrationStatus() {
  const [total, pending, copied, legacyBytes] = await Promise.all([
    prisma.grottoImage.count({ where: { deletedAt: null } }),
    prisma.grottoImage.count({ where: { deletedAt: null, imageData: { not: null }, blobUrl: null } }),
    prisma.grottoImage.count({ where: { deletedAt: null, blobUrl: { not: null } } }),
    prisma.grottoImage.count({ where: { deletedAt: null, imageData: { not: null } } }),
  ]);
  return { total, pending, copied, legacyBytes, copyComplete: pending === 0 };
}

export async function GET(request: NextRequest) {
  if (!verifyArtistSession(request)) return NextResponse.json({ error: "Artist session required." }, { status: 401 });
  return NextResponse.json(await migrationStatus());
}

export async function POST(request: NextRequest) {
  if (!verifyArtistSession(request)) return NextResponse.json({ error: "Artist session required." }, { status: 401 });
  if (request.headers.get("origin") && request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Same-origin migration required." }, { status: 403 });
  if (!grottoBlobConfigured()) return NextResponse.json({ error: "Vercel Blob is not configured." }, { status: 503 });

  const images = await prisma.grottoImage.findMany({
    where: { deletedAt: null, imageData: { not: null }, blobUrl: null },
    orderBy: { createdAt: "asc" },
    take: 4,
    select: { id: true, museId: true, imageData: true, contentType: true },
  });

  let migrated = 0;
  for (const image of images) {
    if (!image.imageData) continue;
    const bytes = Buffer.from(image.imageData);
    const blob = await migrateGrottoImage(image.id, image.museId, bytes, image.contentType);
    try {
      const remote = await inspectGrottoImage(blob.url);
      if (remote.size !== bytes.byteLength) throw new Error(`Blob size mismatch for ${image.id}.`);
      await prisma.grottoImage.update({ where: { id: image.id }, data: { blobUrl: blob.url } });
      migrated += 1;
    } catch (error) {
      await deleteGrottoImages([blob.url]).catch(() => undefined);
      throw error;
    }
  }

  const status = await migrationStatus();
  return NextResponse.json({ migrated, remaining: status.pending, complete: status.copyComplete, ...status });
}
