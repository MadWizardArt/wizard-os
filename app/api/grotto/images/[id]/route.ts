import { NextRequest, NextResponse } from "next/server";
import { verifyArtistSession } from "../../../../../lib/museum-artist-auth";
import { prisma } from "../../../../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === request.nextUrl.host;
  } catch {
    return false;
  }
}

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  if (!verifyArtistSession(request)) {
    return NextResponse.json({ error: "Artist session required." }, { status: 401 });
  }
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin Grotto changes are not accepted." }, { status: 403 });
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  if (typeof body.favorite !== "boolean") {
    return NextResponse.json({ error: "A favorite value is required." }, { status: 400 });
  }

  const existing = await prisma.grottoImage.findFirst({ where: { id, deletedAt: null } });
  if (!existing) return NextResponse.json({ error: "Image not found." }, { status: 404 });

  const image = await prisma.grottoImage.update({
    where: { id },
    data: { favorite: body.favorite },
    select: { id: true, favorite: true },
  });

  return NextResponse.json(image);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  if (!verifyArtistSession(request)) {
    return NextResponse.json({ error: "Artist session required." }, { status: 401 });
  }
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin Grotto changes are not accepted." }, { status: 403 });
  }

  const { id } = await context.params;
  const existing = await prisma.grottoImage.findFirst({ where: { id, deletedAt: null } });
  if (!existing) return NextResponse.json({ error: "Image not found." }, { status: 404 });
  if (existing.canonical) {
    return NextResponse.json({ error: "Canon stays protected." }, { status: 409 });
  }

  await prisma.grottoImage.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  return NextResponse.json({ deleted: true });
}
