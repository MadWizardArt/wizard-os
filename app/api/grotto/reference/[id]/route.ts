import { NextRequest, NextResponse } from "next/server";
import { verifyReference } from "../../../../../lib/grotto-reference";
import { prisma } from "../../../../../lib/prisma";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const query = request.nextUrl.searchParams;
  if (!verifyReference(id, query.get("expires") || "", query.get("signature") || ""))
    return NextResponse.json({ error: "Reference link expired or invalid." }, { status: 403 });
  const image = await prisma.grottoImage.findFirst({ where: { id, deletedAt: null }, select: { imageData: true, contentType: true } });
  if (!image) return NextResponse.json({ error: "Reference not found." }, { status: 404 });
  return new NextResponse(Buffer.from(image.imageData), { headers: {
    "Content-Type": image.contentType, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
  } });
}
