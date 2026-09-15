import { NextResponse } from "next/server";
import { scanMuseObservers } from "../../../../lib/museum-agent-observers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await scanMuseObservers();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Muse observer scan failed", error);
    return NextResponse.json({ error: "muse_observer_scan_failed" }, { status: 500 });
  }
}
