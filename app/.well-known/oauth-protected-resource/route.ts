import { NextResponse } from "next/server";
import { warlockProtectedResourceMetadata } from "../../../lib/warlock-mcp-oauth";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(warlockProtectedResourceMetadata(), {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
