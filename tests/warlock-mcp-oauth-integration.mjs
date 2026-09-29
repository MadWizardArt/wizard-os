import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const origin = process.env.WARLOCK_PUBLIC_ORIGIN;
const operatorKey = process.env.WARLOCK_API_KEY;
assert.ok(origin, "WARLOCK_PUBLIC_ORIGIN must be set for the OAuth integration test");
assert.ok(operatorKey && operatorKey.length >= 32, "CI operator key must be set");

const { CHATGPT_CLIENT_ID, CHATGPT_REDIRECT_URI, WARLOCK_OAUTH_SCOPE, warlockMcpResource } =
  await import("../lib/warlock-mcp-oauth.ts");
const { prisma } = await import("../lib/prisma.ts");
const { tokenHash } = await import("../lib/warlock-mcp-oauth.ts");

const base = origin.replace(/\/+$/, "");
const resource = warlockMcpResource();
const verifier = "integration-verifier-0123456789-ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const challenge = createHash("sha256").update(verifier, "ascii").digest("base64url");
const state = "warlock-oauth-integration-state";
const redirect = "http://127.0.0.1:3000/api/warlock/oauth/authorize?" + new URLSearchParams({
  response_type: "code",
  client_id: CHATGPT_CLIENT_ID,
  redirect_uri: CHATGPT_REDIRECT_URI,
  resource,
  scope: WARLOCK_OAUTH_SCOPE + " offline_access",
  state,
  code_challenge: challenge,
  code_challenge_method: "S256",
});

let code;
let tokens;
try {
  const consent = await fetch(redirect, { redirect: "manual" });
  assert.equal(consent.status, 200, "authorization endpoint should render consent");
  const html = await consent.text();
  assert.match(html, /Authorize Warlock Commerce/);
  assert.match(html, /name="code_challenge"/);

  const form = new URLSearchParams({
    response_type: "code",
    client_id: CHATGPT_CLIENT_ID,
    redirect_uri: CHATGPT_REDIRECT_URI,
    resource,
    scope: WARLOCK_OAUTH_SCOPE + " offline_access",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    operator_key: operatorKey,
  });
  const authorized = await fetch("http://127.0.0.1:3000/api/warlock/oauth/authorize", {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form,
  });
  assert.equal(authorized.status, 303, "consent should issue an authorization code");
  const callback = new URL(authorized.headers.get("location"));
  code = callback.searchParams.get("code");
  assert.ok(code, "authorization callback should carry a code");
  assert.equal(callback.searchParams.get("state"), state);

  const exchange = await fetch("http://127.0.0.1:3000/api/warlock/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: CHATGPT_CLIENT_ID,
      redirect_uri: CHATGPT_REDIRECT_URI,
      resource,
      code,
      code_verifier: verifier,
    }),
  });
  assert.equal(exchange.status, 200, "token endpoint should exchange the one-time code");
  tokens = await exchange.json();
  assert.equal(tokens.token_type, "Bearer");
  assert.equal(tokens.scope, WARLOCK_OAUTH_SCOPE + " offline_access");
  assert.ok(tokens.access_token);
  assert.ok(tokens.refresh_token);

  const mcpUrl = base + "/api/warlock/mcp";
  const callMcp = async (message, sessionId) => {
    const headers = {
      authorization: "Bearer " + tokens.access_token,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    };
    if (sessionId) headers["mcp-session-id"] = sessionId;
    return fetch(mcpUrl, { method: "POST", headers, body: JSON.stringify(message) });
  };
  const rpcPayload = async (response) => {
    const body = await response.text();
    if ((response.headers.get("content-type") || "").includes("text/event-stream")) {
      const data = body.split("\n").find((line) => line.startsWith("data: "));
      assert.ok(data, "MCP event stream should contain a JSON-RPC response");
      return JSON.parse(data.slice(6));
    }
    return JSON.parse(body);
  };

  const initialize = await callMcp({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "warlock-oauth-integration", version: "1.0.0" },
    },
  });
  assert.equal(initialize.status, 200, "OAuth access token should authorize MCP initialize");
  const sessionId = initialize.headers.get("mcp-session-id");
  const initializedResult = await rpcPayload(initialize);
  assert.equal(initializedResult.result?.serverInfo?.name, "warlock-commerce");

  const notification = await callMcp({
    jsonrpc: "2.0",
    method: "notifications/initialized",
  }, sessionId);
  assert.ok([200, 202].includes(notification.status));

  const listed = await callMcp({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
  }, sessionId);
  assert.equal(listed.status, 200, "initialized OAuth session should list tools");
  const listPayload = await rpcPayload(listed);
  const tools = listPayload.result?.tools;
  assert.equal(tools?.length, 10, "all ten Warlock tools should be returned");
  for (const tool of tools) {
    assert.deepEqual(tool.securitySchemes, [{ type: "oauth2", scopes: [WARLOCK_OAUTH_SCOPE] }], tool.name);
    assert.deepEqual(tool._meta?.securitySchemes, tool.securitySchemes, tool.name);
  }

  const replay = await fetch("http://127.0.0.1:3000/api/warlock/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: CHATGPT_CLIENT_ID,
      redirect_uri: CHATGPT_REDIRECT_URI,
      resource,
      code,
      code_verifier: verifier,
    }),
  });
  assert.equal(replay.status, 400, "authorization codes must be single-use");
  console.log("Warlock OAuth consent, code exchange, authenticated MCP initialize, and all ten tools/list descriptors passed.");
} finally {
  if (tokens?.access_token) {
    await prisma.warlockOAuthGrant.deleteMany({
      where: { accessTokenHash: tokenHash(tokens.access_token) },
    });
  }
  if (code) {
    await prisma.warlockOAuthCode.deleteMany({ where: { codeHash: tokenHash(code) } });
  }
  await prisma.$disconnect();
}
