import { head } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { verifyArtistSession } from "../../../../../lib/museum-artist-auth";
import { prisma } from "../../../../../lib/prisma";
import { readGrottoImage } from "../../../../../lib/grotto-blob";
import { MAX_GROTTO_IMAGES } from "../../../../../lib/grotto-capacity";
import { Prisma } from "../../../../generated/prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!verifyArtistSession(request)) return NextResponse.json({ error: "Artist session required." }, { status: 401 });
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Same-origin upload required." }, { status: 403 });
  try {
    const { url } = await request.json() as { url?: unknown };
    if (typeof url !== "string" || url.length > 2000) throw new Error("Invalid reference upload.");
    const blob = await head(url);
    if (!/^grotto\/studio\/references\/[a-f0-9-]{36}-[a-zA-Z0-9._-]{1,240}$/.test(blob.pathname)) throw new Error("Invalid reference storage path.");
    if (blob.size < 1 || blob.size > 10 * 1024 * 1024) throw new Error("Reference exceeds the 10 MB limit.");
    if (!["image/jpeg", "image/png", "image/webp"].includes(blob.contentType)) throw new Error("Choose a JPG, PNG, or WebP image.");
    const file = await readGrottoImage(url);
    if (!file || file.statusCode !== 200) throw new Error("Reference file unavailable.");
    const reader = file.stream.getReader();
    const first = await reader.read();
    await reader.cancel();
    const bytes = Buffer.from(first.value ?? []);
    const detected = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? "image/png"
      : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? "image/jpeg"
      : bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP" ? "image/webp" : null;
    if (detected !== blob.contentType) throw new Error("Invalid image content.");
    const image = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(907300)::text`);
      const existing = await tx.grottoImage.findFirst({ where: { blobUrl: url, deletedAt: null }, select: { id: true, museId: true } });
      if (existing) return existing;
      const count = await tx.grottoImage.count({ where: { deletedAt: null } });
      if (count >= MAX_GROTTO_IMAGES) throw new Error(`The Grotto is limited to ${MAX_GROTTO_IMAGES} images. Delete images before uploading more.`);
      return tx.grottoImage.create({ data: { museId: "studio", provider: "reference", contentType: blob.contentType, blobUrl: url, byteSize: blob.size }, select: { id: true, museId: true } });
    }, { maxWait: 10_000, timeout: 20_000 });
    return NextResponse.json({ id: image.id, museId: image.museId, src: `/api/grotto/images/${image.id}/file`, favorite: false, canonical: false, provider: "reference" }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Reference registration failed." }, { status: 400 });
  }
}
