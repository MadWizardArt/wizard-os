import { createMcpHandler } from "@modelcontextprotocol/server";
import { NextRequest, NextResponse } from "next/server";
import { isWarlockOperatorRequest, WARLOCK_OPERATOR_HEADER } from "../../../../lib/warlock-auth";
import {
  WARLOCK_OAUTH_SCOPE,
  warlockOAuthChallenge,
} from "../../../../lib/warlock-mcp-oauth";
import { isValidWarlockOAuthAccessToken } from "../../../../lib/warlock-mcp-oauth-store";
import { createWarlockCommerceMcpServer } from "../../../../lib/warlock-mcp/server";
import { withWarlockOpenAiToolSecuritySchemes } from "../../../../lib/warlock-mcp/openai-compat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handler = createMcpHandler(createWarlockCommerceMcpServer);

async function isAuthorized(request: NextRequest) {
  if (isWarlockOperatorRequest(request)) return true;

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return false;
  const token = authorization.slice(7).trim();

  // Preserve the existing private operator-key path for trusted direct clients.
  const headers = new Headers(request.headers);
  headers.set(WARLOCK_OPERATOR_HEADER, token);
  if (isWarlockOperatorRequest({ headers })) return true;

  // ChatGPT Business uses a short-lived opaque OAuth access token.
  const validOAuthToken = await isValidWarlockOAuthAccessToken(token);
  if (validOAuthToken) {
    console.info("Warlock MCP accepted OAuth access token", { method: request.method });
  }
  return validOAuthToken;
}

async function serve(request: NextRequest) {
  if (process.env.WARLOCK_MCP_ENABLED !== "true") {
    return NextResponse.json({ error: "warlock_mcp_disabled" }, { status: 503 });
  }
  if (!(await isAuthorized(request))) {
    return NextResponse.json(
      {
        error: "warlock_operator_required",
        scope: WARLOCK_OAUTH_SCOPE,
      },
      {
        status: 401,
        headers: {
          "Cache-Control": "no-store",
          "WWW-Authenticate": warlockOAuthChallenge(),
        },
      },
    );
  }
  return withWarlockOpenAiToolSecuritySchemes(await handler.fetch(request));
}

export const GET = serve;
export const POST = serve;
export const DELETE = serve;
