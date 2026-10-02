import { NextRequest, NextResponse } from "next/server";
import { grottoPurgeCounts, purgeNonFavoriteGrottoImages } from "../../../../../lib/grotto-delete";
import { verifyArtistSession } from "../../../../../lib/museum-artist-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
// Purge endpoint is intentionally resumable; each request deletes at most one safe batch.

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  return !origin || origin === request.nextUrl.origin;
}

export async function GET(request: NextRequest) {
  if (!verifyArtistSession(request)) return NextResponse.json({ error: "Artist session required." }, { status: 401 });
  return NextResponse.json(await grottoPurgeCounts());
}

export async function POST(request: NextRequest) {
  if (!verifyArtistSession(request)) return NextResponse.json({ error: "Artist session required." }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Same-origin deletion required." }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const expectedCount = Number(body.expectedCount);
  if (body.confirmation !== "DELETE NON-FAVORITES" || !Number.isSafeInteger(expectedCount) || expectedCount < 0) {
    return NextResponse.json({ error: "Review the counts and complete both confirmations." }, { status: 400 });
  }
  try {
    const result = await purgeNonFavoriteGrottoImages(expectedCount, 100);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Non-favorites could not be deleted." }, { status: 409 });
  }
}
