import { NextRequest, NextResponse } from "next/server";
import { verifyArtistSession } from "../../../../../lib/museum-artist-auth";
import { prisma } from "../../../../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MUSES = new Set(["novy", "aurelia", "callista", "cleo", "lyra", "melina", "seraphine", "tessa", "thalia"]);
type RouteContext = { params: Promise<{ museId: string }> };

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  return !origin || new URL(origin).host === request.nextUrl.host;
}

function detectedType(bytes: Buffer) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (bytes.toString("ascii", 0, 6) === "GIF87a" || bytes.toString("ascii", 0, 6) === "GIF89a") return "image/gif";
  return null;
}

export async function GET(request: NextRequest, context: RouteContext) {
  if (!verifyArtistSession(request)) return NextResponse.json({ error: "Artist session required." }, { status: 401 });
  const { museId } = await context.params;
  if (!MUSES.has(museId)) return NextResponse.json({ error: "Unknown Muse." }, { status: 400 });
  const header = await prisma.grottoImage.findFirst({ where: { museId, provider: "header", deletedAt: null }, orderBy: { createdAt: "desc" }, select: { id: true } });
  return NextResponse.json(header ? { id: header.id, src: `/api/grotto/images/${header.id}/file` } : null);
}

export async function POST(request: NextRequest, context: RouteContext) {
  if (!verifyArtistSession(request)) return NextResponse.json({ error: "Artist session required." }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Same-origin upload required." }, { status: 403 });
  const { museId } = await context.params;
  if (!MUSES.has(museId)) return NextResponse.json({ error: "Unknown Muse." }, { status: 400 });
  const form = await request.formData();
  const file = form.get("header");
  if (!(file instanceof File) || file.size === 0 || file.size > 20 * 1024 * 1024) return NextResponse.json({ error: "Choose a JPG, PNG, WebP, or GIF under 20 MB." }, { status: 400 });
  const bytes = Buffer.from(await file.arrayBuffer());
  const contentType = detectedType(bytes);
  if (!contentType) return NextResponse.json({ error: "Choose a JPG, PNG, WebP, or GIF." }, { status: 400 });
  const image = await prisma.$transaction(async (tx) => {
    await tx.grottoImage.updateMany({ where: { museId, provider: "header", deletedAt: null }, data: { deletedAt: new Date() } });
    return tx.grottoImage.create({ data: { museId, provider: "header", contentType, imageData: bytes, byteSize: bytes.length }, select: { id: true } });
  });
  return NextResponse.json({ id: image.id, src: `/api/grotto/images/${image.id}/file` }, { status: 201 });
}
