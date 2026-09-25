import { del, get } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { verifyArtistSession } from "../../../../../lib/museum-artist-auth";
import { isWarlockOperatorRequest } from "../../../../../lib/warlock-auth";
import { prisma } from "../../../../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: NextRequest) {
  return verifyArtistSession(request) || isWarlockOperatorRequest(request);
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const asset = await prisma.spellmarkAsset.findUnique({ where: { id } });
  if (!asset) return NextResponse.json({ error: "asset_not_found" }, { status: 404 });

  const result = await get(asset.blobUrl, { access: "private" });
  if (!result || result.statusCode !== 200) return NextResponse.json({ error: "blob_not_found" }, { status: 404 });

  return new NextResponse(result.stream, {
    headers: {
      "Content-Type": asset.contentType || result.blob.contentType || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${asset.fileName.replace(/"/g, "")}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!verifyArtistSession(request)) return NextResponse.json({ error: "artist_session_required" }, { status: 401 });
  const { id } = await context.params;
  const asset = await prisma.spellmarkAsset.findUnique({ where: { id } });
  if (!asset) return NextResponse.json({ error: "asset_not_found" }, { status: 404 });
  await del(asset.blobUrl);
  await prisma.spellmarkAsset.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
