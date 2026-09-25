import { createMcpHandler } from "@modelcontextprotocol/server";
import { NextRequest, NextResponse } from "next/server";
import { isWarlockOperatorRequest, WARLOCK_OPERATOR_HEADER } from "../../../../lib/warlock-auth";
import { createWarlockCommerceMcpServer } from "../../../../lib/warlock-mcp/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handler = createMcpHandler(createWarlockCommerceMcpServer);

function isAuthorized(request: NextRequest) {
  if (isWarlockOperatorRequest(request)) return true;
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return false;

  const headers = new Headers(request.headers);
  headers.set(WARLOCK_OPERATOR_HEADER, authorization.slice(7).trim());
  return isWarlockOperatorRequest({ headers });
}

async function serve(request: NextRequest) {
  if (process.env.WARLOCK_MCP_ENABLED !== "true") {
    return NextResponse.json({ error: "warlock_mcp_disabled" }, { status: 503 });
  }
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { error: "warlock_operator_required" },
      { status: 401, headers: { "WWW-Authenticate": "Bearer" } },
    );
  }
  return handler.fetch(request);
}

export const GET = serve;
export const POST = serve;
export const DELETE = serve;
