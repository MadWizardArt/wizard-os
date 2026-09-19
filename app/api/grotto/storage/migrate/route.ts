import { NextRequest, NextResponse } from "next/server";
import { deleteGrottoImages, grottoBlobConfigured, inspectGrottoImage, migrateGrottoImage } from "../../../../../lib/grotto-blob";
import { verifyArtistSession } from "../../../../../lib/museum-artist-auth";
import { prisma } from "../../../../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function migrationStatus() {
  const [total, pending, copied, activeLegacy, deleted, deletedLegacy, activeBytes, deletedBytes] = await Promise.all([
    prisma.grottoImage.count({ where: { deletedAt: null } }),
    prisma.grottoImage.count({ where: { deletedAt: null, imageData: { not: null }, blobUrl: null } }),
    prisma.grottoImage.count({ where: { deletedAt: null, blobUrl: { not: null } } }),
    prisma.grottoImage.count({ where: { deletedAt: null, imageData: { not: null } } }),
    prisma.grottoImage.count({ where: { deletedAt: { not: null } } }),
    prisma.grottoImage.count({ where: { deletedAt: { not: null }, imageData: { not: null } } }),
    prisma.grottoImage.aggregate({ where: { deletedAt: null, imageData: { not: null } }, _sum: { byteSize: true } }),
    prisma.grottoImage.aggregate({ where: { deletedAt: { not: null }, imageData: { not: null } }, _sum: { byteSize: true } }),
  ]);
  return { total, pending, copied, activeLegacy, deleted, deletedLegacy, activeLegacyBytes: activeBytes._sum.byteSize ?? 0, deletedLegacyBytes: deletedBytes._sum.byteSize ?? 0, copyComplete: pending === 0, cleanupComplete: activeLegacy === 0 && deleted === 0 };
}

export async function GET(request: NextRequest) {
  if (!verifyArtistSession(request)) return NextResponse.json({ error: "Artist session required." }, { status: 401 });
  return NextResponse.json(await migrationStatus());
}

export async function POST(request: NextRequest) {
  if (!verifyArtistSession(request)) return NextResponse.json({ error: "Artist session required." }, { status: 401 });
  if (request.headers.get("origin") && request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Same-origin migration required." }, { status: 403 });
  if (!grottoBlobConfigured()) return NextResponse.json({ error: "Vercel Blob is not configured." }, { status: 503 });

  const body = await request.json().catch(() => ({})) as { action?: string };
  if (body.action === "cleanup") {
    const pending = await prisma.grottoImage.count({ where: { deletedAt: null, imageData: { not: null }, blobUrl: null } });
    if (pending) return NextResponse.json({ error: `Cleanup blocked: ${pending} active images do not have Blob copies.` }, { status: 409 });
    const images = await prisma.grottoImage.findMany({
      where: { deletedAt: null, imageData: { not: null }, blobUrl: { not: null } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 8,
      select: { id: true, imageData: true, blobUrl: true, byteSize: true },
    });
    let cleaned = 0;
    let releasedBytes = 0;
    for (const image of images) {
      if (!image.imageData || !image.blobUrl) continue;
      const localSize = Buffer.from(image.imageData).byteLength;
      const remote = await inspectGrottoImage(image.blobUrl);
      if (Number(remote.size) !== localSize || Number(image.byteSize) !== localSize) {
        return NextResponse.json({ error: `Verification failed for ${image.id}; Neon was not changed.` }, { status: 409 });
      }
      const result = await prisma.grottoImage.updateMany({
        where: { id: image.id, blobUrl: image.blobUrl, imageData: { not: null }, deletedAt: null },
        data: { imageData: null },
      });
      if (result.count === 1) { cleaned += 1; releasedBytes += localSize; }
    }
    const status = await migrationStatus();
    return NextResponse.json({ action: "cleanup", cleaned, releasedBytes, ...status });
  }

  if (body.action === "purge-deleted") {
    const activeLegacy = await prisma.grottoImage.count({ where: { deletedAt: null, imageData: { not: null } } });
    if (activeLegacy) return NextResponse.json({ error: `Deleted-row purge blocked until ${activeLegacy} active legacy binaries are cleaned.` }, { status: 409 });
    const result = await prisma.grottoImage.deleteMany({ where: { deletedAt: { not: null } } });
    const status = await migrationStatus();
    return NextResponse.json({ action: "purge-deleted", purged: result.count, ...status });
  }

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
