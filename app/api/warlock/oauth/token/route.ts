import { NextRequest, NextResponse } from "next/server";
import { CHATGPT_CLIENT_ID, warlockMcpResource } from "../../../../../lib/warlock-mcp-oauth";
import {
  exchangeWarlockAuthorizationCode,
  refreshWarlockOAuthGrant,
} from "../../../../../lib/warlock-mcp-oauth-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function tokenHeaders() {
  return {
    "Cache-Control": "no-store",
    "Pragma": "no-cache",
    "X-Content-Type-Options": "nosniff",
  };
}

function oauthError(error: string, description: string, status = 400) {
  return NextResponse.json(
    { error, error_description: description },
    { status, headers: tokenHeaders() },
  );
}

function stringField(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

export async function POST(request: NextRequest) {
  if (process.env.WARLOCK_MCP_ENABLED !== "true") {
    return oauthError("temporarily_unavailable", "Warlock MCP is disabled.", 503);
  }

  const form = await request.formData();
  const grantType = stringField(form, "grant_type");
  const clientId = stringField(form, "client_id");

  if (clientId !== CHATGPT_CLIENT_ID) {
    return oauthError("invalid_client", "This OAuth client is not allowed.", 401);
  }

  try {
    if (grantType === "authorization_code") {
      const resource = stringField(form, "resource");
      if (resource !== warlockMcpResource()) {
        return oauthError("invalid_target", "The requested resource is not Warlock MCP.");
      }
      const result = await exchangeWarlockAuthorizationCode({
        code: stringField(form, "code"),
        clientId,
        redirectUri: stringField(form, "redirect_uri"),
        resource,
        codeVerifier: stringField(form, "code_verifier"),
      });
      return NextResponse.json(result, { headers: tokenHeaders() });
    }

    if (grantType === "refresh_token") {
      const result = await refreshWarlockOAuthGrant({
        refreshToken: stringField(form, "refresh_token"),
        clientId,
        resource: stringField(form, "resource") || null,
      });
      return NextResponse.json(result, { headers: tokenHeaders() });
    }

    return oauthError("unsupported_grant_type", "Warlock supports authorization_code and refresh_token.");
  } catch (error) {
    const code = error instanceof Error ? error.message : "invalid_grant";
    if (code === "invalid_client") return oauthError("invalid_client", "This OAuth client is not allowed.", 401);
    return oauthError("invalid_grant", "The authorization grant is invalid, expired, consumed, or no longer trusted.");
  }
}
