import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CHATGPT_CLIENT_ID,
  CHATGPT_REDIRECT_URI,
  WARLOCK_OAUTH_SCOPE,
  normalizeOAuthScope,
  pkceChallenge,
  validateAuthorizationInput,
  warlockMcpResource,
  warlockOAuthChallenge,
  warlockOAuthMetadata,
  warlockProtectedResourceMetadata,
} from "../lib/warlock-mcp-oauth.ts";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Warlock OAuth discovery is bound to the canonical MCP resource", () => {
  const resource = warlockProtectedResourceMetadata();
  const auth = warlockOAuthMetadata();

  assert.equal(resource.resource, warlockMcpResource());
  assert.deepEqual(resource.authorization_servers, [auth.issuer]);
  assert.ok(resource.scopes_supported.includes(WARLOCK_OAUTH_SCOPE));
  assert.equal(auth.authorization_response_iss_parameter_supported, true);
  assert.equal(auth.client_id_metadata_document_supported, true);
  assert.deepEqual(auth.token_endpoint_auth_methods_supported, ["none"]);
  assert.ok(auth.code_challenge_methods_supported.includes("S256"));
  assert.ok(auth.grant_types_supported.includes("authorization_code"));
  assert.ok(auth.grant_types_supported.includes("refresh_token"));
});

test("Warlock OAuth only accepts the stable ChatGPT client and callback", () => {
  const base = {
    responseType: "code",
    clientId: CHATGPT_CLIENT_ID,
    redirectUri: CHATGPT_REDIRECT_URI,
    resource: warlockMcpResource(),
    scope: WARLOCK_OAUTH_SCOPE,
    state: "state-123",
    codeChallenge: "A".repeat(43),
    codeChallengeMethod: "S256",
  };

  assert.equal(validateAuthorizationInput(base), true);
  assert.throws(
    () => validateAuthorizationInput({ ...base, clientId: "https://attacker.example/client.json" }),
    /unauthorized_client/,
  );
  assert.throws(
    () => validateAuthorizationInput({ ...base, redirectUri: "https://attacker.example/callback" }),
    /invalid_redirect_uri/,
  );
  assert.throws(
    () => validateAuthorizationInput({ ...base, resource: "https://attacker.example/mcp" }),
    /invalid_target/,
  );
});

test("Warlock OAuth enforces PKCE S256 and narrow scopes", () => {
  const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  assert.equal(pkceChallenge(verifier), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  assert.equal(normalizeOAuthScope(WARLOCK_OAUTH_SCOPE), WARLOCK_OAUTH_SCOPE);
  assert.equal(
    normalizeOAuthScope(WARLOCK_OAUTH_SCOPE + " offline_access"),
    WARLOCK_OAUTH_SCOPE + " offline_access",
  );
  assert.throws(() => normalizeOAuthScope("offline_access"), /required_scope_missing/);
  assert.throws(() => normalizeOAuthScope(WARLOCK_OAUTH_SCOPE + " admin"), /unsupported_scope/);
});

test("Warlock MCP challenges unauthenticated clients with OAuth resource metadata", () => {
  const challenge = warlockOAuthChallenge();
  assert.match(challenge, /resource_metadata=/);
  assert.match(challenge, new RegExp(WARLOCK_OAUTH_SCOPE.replace(":", "\\:")));
  assert.match(challenge, /error="invalid_token"/);

  const route = source("app/api/warlock/mcp/route.ts");
  assert.match(route, /isValidWarlockOAuthAccessToken/);
  assert.match(route, /warlockOAuthChallenge/);
  assert.match(route, /WARLOCK_MCP_ENABLED/);
  assert.match(route, /isWarlockOperatorRequest/);
});

test("OAuth endpoints are fail-closed and never alter commerce write mode", () => {
  const authorize = source("app/api/warlock/oauth/authorize/route.ts");
  const token = source("app/api/warlock/oauth/token/route.ts");
  const server = source("lib/warlock-mcp/server.ts");

  assert.match(authorize, /verifyWarlockOperatorKey/);
  assert.match(authorize, /CHATGPT_REDIRECT_URI/);
  assert.match(authorize, /codeChallenge/);
  assert.match(token, /exchangeWarlockAuthorizationCode/);
  assert.match(token, /refreshWarlockOAuthGrant/);
  assert.match(server, /securitySchemes/);

  assert.doesNotMatch(authorize, /WARLOCK_COMMERCE_WRITE_MODE/);
  assert.doesNotMatch(token, /WARLOCK_COMMERCE_WRITE_MODE/);
});

test("OAuth persistence stores only token hashes and supports one-time codes", () => {
  const schema = source("prisma/schema.prisma");
  const store = source("lib/warlock-mcp-oauth-store.ts");

  assert.match(schema, /model WarlockOAuthCode/);
  assert.match(schema, /consumedAt\s+DateTime\?/);
  assert.match(schema, /model WarlockOAuthGrant/);
  assert.match(schema, /accessTokenHash\s+String\s+@unique/);
  assert.match(schema, /refreshTokenHash\s+String\s+@unique/);
  assert.match(schema, /operatorKeyFingerprint\s+String/);

  assert.match(store, /updateMany/);
  assert.match(store, /refreshTokenHash/);
  assert.match(store, /operatorKeyFingerprint/);
  assert.doesNotMatch(schema, /accessToken\s+String/);
  assert.doesNotMatch(schema, /refreshToken\s+String/);
});
