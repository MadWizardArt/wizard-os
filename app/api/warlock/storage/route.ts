import { NextRequest, NextResponse } from "next/server";
import { verifyArtistSession } from "../../../../lib/museum-artist-auth";
import { prisma } from "../../../../lib/prisma";
import { sameOrigin } from "../../../../lib/warlock-products";
import { auditWarlockBlobStorage, deleteVerifiedWarlockOrphans } from "../../../../lib/warlock-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: NextRequest) {
  if (!verifyArtistSession(request)) {
    return NextResponse.json({ error: "artist_session_required" }, { status: 401, headers });
  }
  const audit = await auditWarlockBlobStorage(prisma);
  return NextResponse.json({
    scanned: audit.scanned,
    canonical: audit.canonical,
    orphaned: audit.orphaned,
  }, { headers });
}

export async function POST(request: NextRequest) {
  if (!verifyArtistSession(request)) {
    return NextResponse.json({ error: "artist_session_required" }, { status: 401, headers });
  }
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "cross_origin_request" }, { status: 403, headers });
  }

  const body = await request.json().catch(() => ({})) as {
    confirmation?: string;
    expectedCount?: number;
    expectedBytes?: number;
  };

  if (
    body.confirmation !== "DELETE ORPHAN WARLOCK BLOBS" ||
    !Number.isSafeInteger(body.expectedCount) ||
    !Number.isSafeInteger(body.expectedBytes) ||
    Number(body.expectedCount) < 0 ||
    Number(body.expectedBytes) < 0
  ) {
    return NextResponse.json({ error: "review_storage_audit_first" }, { status: 400, headers });
  }

  try {
    const remaining = await deleteVerifiedWarlockOrphans(prisma, {
      count: Number(body.expectedCount),
      bytes: Number(body.expectedBytes),
    });
    return NextResponse.json({
      deleted: {
        count: Number(body.expectedCount),
        bytes: Number(body.expectedBytes),
      },
      remaining: {
        scanned: remaining.scanned,
        canonical: remaining.canonical,
        orphaned: remaining.orphaned,
      },
    }, { headers });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "warlock_storage_cleanup_failed",
    }, { status: 409, headers });
  }
}
