import { NextRequest, NextResponse } from "next/server";
import { verifyWarlockOperatorKey } from "../../../../../lib/warlock-auth";
import {
  CHATGPT_CLIENT_ID,
  CHATGPT_REDIRECT_URI,
  escapeHtml,
  normalizeOAuthScope,
  oauthErrorCode,
  validateAuthorizationInput,
  warlockPublicOrigin,
  type WarlockOAuthAuthorizationInput,
} from "../../../../../lib/warlock-mcp-oauth";
import { createWarlockAuthorizationCode } from "../../../../../lib/warlock-mcp-oauth-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function headers() {
  return {
    "Cache-Control": "no-store",
    "Pragma": "no-cache",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    // Chromium applies form-action to redirects after the consent POST as well.
    "Content-Security-Policy": `default-src 'none'; style-src 'unsafe-inline'; form-action 'self' ${new URL(CHATGPT_REDIRECT_URI).origin}; base-uri 'none'; frame-ancestors 'none'`,
  };
}

function authorizationInput(values: URLSearchParams | FormData): WarlockOAuthAuthorizationInput {
  const read = (key: string) => {
    const value = values.get(key);
    return typeof value === "string" ? value : "";
  };
  return {
    responseType: read("response_type"),
    clientId: read("client_id"),
    redirectUri: read("redirect_uri"),
    resource: read("resource"),
    scope: read("scope"),
    state: read("state"),
    codeChallenge: read("code_challenge"),
    codeChallengeMethod: read("code_challenge_method"),
  };
}

function canRedirect(input: WarlockOAuthAuthorizationInput) {
  return input.clientId === CHATGPT_CLIENT_ID && input.redirectUri === CHATGPT_REDIRECT_URI;
}

function oauthError(input: WarlockOAuthAuthorizationInput, error: unknown) {
  const code = oauthErrorCode(error);
  if (!canRedirect(input)) {
    return NextResponse.json(
      { error: code, error_description: "The OAuth authorization request is not valid for this client." },
      { status: 400, headers: headers() },
    );
  }

  const target = new URL(input.redirectUri);
  target.searchParams.set("error", code);
  target.searchParams.set("error_description", "Warlock could not authorize this request.");
  if (input.state) target.searchParams.set("state", input.state);
  target.searchParams.set("iss", warlockPublicOrigin());
  return NextResponse.redirect(target, { status: 302, headers: headers() });
}

function hidden(name: string, value: string) {
  return '<input type="hidden" name="' + escapeHtml(name) + '" value="' + escapeHtml(value) + '">';
}

function consentPage(input: WarlockOAuthAuthorizationInput, message = "") {
  const scope = normalizeOAuthScope(input.scope);
  const fields = [
    ["response_type", input.responseType],
    ["client_id", input.clientId],
    ["redirect_uri", input.redirectUri],
    ["resource", input.resource],
    ["scope", scope],
    ["state", input.state],
    ["code_challenge", input.codeChallenge],
    ["code_challenge_method", input.codeChallengeMethod],
  ].map(([name, value]) => hidden(name, value)).join("\n");

  const notice = message
    ? '<p class="error">' + escapeHtml(message) + '</p>'
    : '<p>ChatGPT is requesting access to your private Warlock Commerce MCP tools.</p>';

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Authorize Warlock Commerce</title>
<style>
body{font-family:ui-sans-serif,system-ui,sans-serif;background:#111;color:#eee;margin:0;display:grid;min-height:100vh;place-items:center}
main{width:min(520px,calc(100% - 40px));background:#1b1b1b;border:1px solid #333;border-radius:16px;padding:28px;box-shadow:0 18px 60px #0008}
h1{font-size:1.35rem;margin:0 0 12px}.muted{color:#aaa;font-size:.92rem}.error{color:#ffb4b4}
label{display:block;margin:22px 0 8px;font-weight:650}input[type=password]{box-sizing:border-box;width:100%;padding:12px;border-radius:10px;border:1px solid #555;background:#0f0f0f;color:#fff}
button{margin-top:18px;width:100%;padding:12px;border:0;border-radius:10px;font-weight:750;cursor:pointer}
code{color:#ddd}
</style>
</head>
<body>
<main>
<h1>Authorize Warlock Commerce</h1>
${notice}
<p class="muted">Client: ChatGPT<br>Permission: <code>${escapeHtml(scope)}</code><br>This authorizes the single-owner Warlock connection only. It does not enable Etsy publishing or commerce draft mode.</p>
<form method="post" action="/api/warlock/oauth/authorize">
${fields}
<label for="operator_key">Warlock operator key</label>
<input id="operator_key" name="operator_key" type="password" autocomplete="current-password" required minlength="32">
<button type="submit">Authorize ChatGPT</button>
</form>
</main>
</body>
</html>`;

  return new NextResponse(html, {
    status: message ? 401 : 200,
    headers: { ...headers(), "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function GET(request: NextRequest) {
  if (process.env.WARLOCK_MCP_ENABLED !== "true") {
    return NextResponse.json({ error: "warlock_mcp_disabled" }, { status: 503, headers: headers() });
  }
  const input = authorizationInput(request.nextUrl.searchParams);
  try {
    validateAuthorizationInput(input);
    return consentPage(input);
  } catch (error) {
    return oauthError(input, error);
  }
}

export async function POST(request: NextRequest) {
  if (process.env.WARLOCK_MCP_ENABLED !== "true") {
    return NextResponse.json({ error: "warlock_mcp_disabled" }, { status: 503, headers: headers() });
  }

  const form = await request.formData();
  const input = authorizationInput(form);
  try {
    validateAuthorizationInput(input);
  } catch (error) {
    return oauthError(input, error);
  }

  const supplied = form.get("operator_key");
  if (typeof supplied !== "string" || !verifyWarlockOperatorKey(supplied)) {
    console.warn("Warlock OAuth authorization rejected", {
      client: "chatgpt",
      resource: input.resource,
      scope: normalizeOAuthScope(input.scope),
      reason: "operator_key_rejected",
    });
    return consentPage(input, "The Warlock operator key was not accepted.");
  }

  const scope = normalizeOAuthScope(input.scope);
  console.info("Warlock OAuth authorization accepted", {
    client: "chatgpt",
    resource: input.resource,
    scope,
    statePresent: Boolean(input.state),
  });

  const code = await createWarlockAuthorizationCode({
    clientId: input.clientId,
    redirectUri: input.redirectUri,
    resource: input.resource,
    scope,
    codeChallenge: input.codeChallenge,
  });

  console.info("Warlock OAuth authorization code issued", {
    client: "chatgpt",
    resource: input.resource,
    scope,
  });

  const target = new URL(input.redirectUri);
  target.searchParams.set("code", code);
  if (input.state) target.searchParams.set("state", input.state);
  target.searchParams.set("iss", warlockPublicOrigin());
  return NextResponse.redirect(target, { status: 303, headers: headers() });
}
