import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TEST_TITLE = "TEST — Aurelia Original API Handoff — 2026-09-14";

export async function GET(request: NextRequest) {
  const secret = process.env.MUSE_HANDOFF_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "muse_handoff_secret_missing" }, { status: 500 });
  }

  const base = request.nextUrl.origin;
  const endpoint = `${base}/api/etsy/aurelia-drafts`;

  const existingResponse = await fetch(endpoint, { cache: "no-store" });
  const existingData = await existingResponse.json().catch(() => ({ drafts: [] }));
  const existing = Array.isArray(existingData?.drafts)
    ? existingData.drafts.find((draft: { title?: string }) => draft?.title === TEST_TITLE)
    : null;

  if (existing) {
    return NextResponse.json({ ok: true, alreadyReceived: true, draft: existing });
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-muse-handoff-secret": secret,
    },
    body: JSON.stringify({
      internalName: TEST_TITLE,
      status: "handoff_ready",
      collection: "TEST",
      title: TEST_TITLE,
      description: "Internal verification of the original Aurelia → Warlock API path. Test only. Do not publish to Etsy.",
      price: 9.99,
      launchPrice: 9.99,
      tags: ["test handoff", "aurelia", "warlock"],
      categorySearch: "test digital product",
    }),
  });

  const data = await response.json().catch(() => ({}));
  return NextResponse.json(
    { ok: response.ok, upstreamStatus: response.status, result: data },
    { status: response.ok ? 200 : 502 },
  );
}
