import { NextResponse } from "next/server";
import { warlockOAuthMetadata } from "../../../lib/warlock-mcp-oauth";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(warlockOAuthMetadata(), {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
