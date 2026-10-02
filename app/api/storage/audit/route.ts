import { NextRequest, NextResponse } from "next/server";
import { verifyArtistSession } from "../../../../lib/museum-artist-auth";
import { prisma } from "../../../../lib/prisma";
import { auditBlobStorage } from "../../../../lib/blob-storage-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!verifyArtistSession(request)) {
    return NextResponse.json({ error: "artist_session_required" }, { status: 401 });
  }

  try {
    return NextResponse.json(await auditBlobStorage(prisma), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "blob_storage_audit_failed" },
      { status: 500 },
    );
  }
}
