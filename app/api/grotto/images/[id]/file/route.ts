import { NextRequest, NextResponse } from "next/server";
import { verifyArtistSession } from "../../../../../../lib/museum-artist-auth";
import { prisma } from "../../../../../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  if (!verifyArtistSession(request)) {
    return NextResponse.json({ error: "Artist session required." }, { status: 401 });
  }

  const { id } = await context.params;
  const image = await prisma.grottoImage.findFirst({
    where: { id, deletedAt: null },
    select: { imageData: true, contentType: true, byteSize: true },
  });

  if (!image) return NextResponse.json({ error: "Image not found." }, { status: 404 });

  return new NextResponse(Buffer.from(image.imageData), {
    status: 200,
    headers: {
      "Content-Type": image.contentType,
      "Content-Length": String(image.byteSize),
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
