import { get } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await context.params;
  const painting = await prisma.painting.findUnique({
    where: { projectId },
    select: { thumbnail: true },
  });
  const thumbnail = painting?.thumbnail?.trim();
  if (!thumbnail) {
    return NextResponse.json({ error: "Painting image not found." }, { status: 404 });
  }

  let url: URL;
  try {
    url = new URL(thumbnail);
  } catch {
    return NextResponse.json({ error: "Painting image URL is invalid." }, { status: 400 });
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    return NextResponse.json({ error: "Painting image URL is invalid." }, { status: 400 });
  }

  if (!url.hostname.endsWith(".private.blob.vercel-storage.com")) {
    return NextResponse.redirect(url, 302);
  }

  const result = await get(thumbnail, { access: "private" });
  if (!result || result.statusCode !== 200) {
    return NextResponse.json({ error: "Painting image file not found." }, { status: 404 });
  }
  return new NextResponse(result.stream, {
    headers: {
      "Content-Type": result.blob.contentType || "application/octet-stream",
      "Content-Length": String(result.blob.size),
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
