import { NextRequest, NextResponse } from "next/server";
import { clearMuseHandoffSession, hasMuseHandoffSession, secretMatches, setMuseHandoffSession } from "../../../../lib/muse-handoff-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return NextResponse.json({ authenticated: hasMuseHandoffSession(request) });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const secret = typeof body?.secret === "string" ? body.secret : "";
  if (!secretMatches(secret)) {
    return NextResponse.json({ error: "invalid_secret" }, { status: 401 });
  }
  return setMuseHandoffSession(NextResponse.json({ ok: true, authenticated: true }));
}

export async function DELETE() {
  return clearMuseHandoffSession(NextResponse.json({ ok: true, authenticated: false }));
}
