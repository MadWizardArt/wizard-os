import { createHash, randomBytes } from "node:crypto";

export const WARLOCK_OAUTH_SCOPE = "warlock:operate";
export const WARLOCK_OFFLINE_SCOPE = "offline_access";
export const CHATGPT_CLIENT_ID = "https://chatgpt.com/oauth/client.json";
export const CHATGPT_REDIRECT_URI = "https://chatgpt.com/connector_platform_oauth_redirect";

const DEFAULT_WARLOCK_ORIGIN = "https://wizard-os-299p-jade.vercel.app";
const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;
const AUTH_CODE_TTL_SECONDS = 5 * 60;

export type WarlockOAuthAuthorizationInput = {
  responseType: string;
  clientId: string;
  redirectUri: string;
  resource: string;
  scope: string;
  state: string;
  codeChallenge: string;
  codeChallengeMethod: string;
};

export function warlockPublicOrigin() {
  const configured = (process.env.WARLOCK_PUBLIC_ORIGIN ?? DEFAULT_WARLOCK_ORIGIN).trim();
  const withoutSlash = configured.replace(/\/+$/, "");
  const url = new URL(withoutSlash);
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error("WARLOCK_PUBLIC_ORIGIN must be an origin without a path, query, or fragment");
  }
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new Error("WARLOCK_PUBLIC_ORIGIN must use https in production");
  }
  return url.origin;
}

export function warlockMcpResource() {
  return warlockPublicOrigin() + "/api/warlock/mcp";
}

export function warlockOAuthMetadata() {
  const issuer = warlockPublicOrigin();
  return {
    issuer,
    authorization_response_iss_parameter_supported: true,
    authorization_endpoint: issuer + "/api/warlock/oauth/authorize",
    token_endpoint: issuer + "/api/warlock/oauth/token",
    client_id_metadata_document_supported: true,
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: [WARLOCK_OAUTH_SCOPE, WARLOCK_OFFLINE_SCOPE],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
  };
}

export function warlockProtectedResourceMetadata() {
  const issuer = warlockPublicOrigin();
  return {
    resource: warlockMcpResource(),
    authorization_servers: [issuer],
    scopes_supported: [WARLOCK_OAUTH_SCOPE],
  };
}

export function warlockOAuthChallenge(error = "invalid_token", description = "Connect Warlock to continue.") {
  const metadata = warlockPublicOrigin() + "/.well-known/oauth-protected-resource";
  return [
    `Bearer resource_metadata="${metadata}"`,
    `scope="${WARLOCK_OAUTH_SCOPE}"`,
    `error="${error.replace(/["\\]/g, "")}"`,
    `error_description="${description.replace(/["\\]/g, "")}"`,
  ].join(", ");
}

export function normalizeOAuthScope(value: string | null | undefined) {
  const requested = (value ?? WARLOCK_OAUTH_SCOPE)
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const unique = [...new Set(requested)];
  if (!unique.includes(WARLOCK_OAUTH_SCOPE)) {
    throw new Error("required_scope_missing");
  }
  for (const scope of unique) {
    if (scope !== WARLOCK_OAUTH_SCOPE && scope !== WARLOCK_OFFLINE_SCOPE) {
      throw new Error("unsupported_scope");
    }
  }
  return [WARLOCK_OAUTH_SCOPE, ...(unique.includes(WARLOCK_OFFLINE_SCOPE) ? [WARLOCK_OFFLINE_SCOPE] : [])].join(" ");
}

export function validateAuthorizationInput(input: WarlockOAuthAuthorizationInput) {
  if (input.responseType !== "code") throw new Error("unsupported_response_type");
  if (input.clientId !== CHATGPT_CLIENT_ID) throw new Error("unauthorized_client");
  if (input.redirectUri !== CHATGPT_REDIRECT_URI) throw new Error("invalid_redirect_uri");
  if (input.resource !== warlockMcpResource()) throw new Error("invalid_target");
  normalizeOAuthScope(input.scope);
  if (input.codeChallengeMethod !== "S256") throw new Error("invalid_request");
  if (!/^[A-Za-z0-9_-]{43}$/.test(input.codeChallenge)) throw new Error("invalid_request");
  if (input.state.length > 2048) throw new Error("invalid_request");
  return true;
}

export function pkceChallenge(verifier: string) {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) {
    throw new Error("invalid_code_verifier");
  }
  return createHash("sha256").update(verifier, "ascii").digest("base64url");
}

export function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function operatorKeyFingerprint() {
  const key = process.env.WARLOCK_API_KEY ?? "";
  if (key.length < 32) throw new Error("WARLOCK_API_KEY must be at least 32 characters");
  return createHash("sha256").update("warlock-oauth-v1\0").update(key).digest("hex");
}

export function randomAuthorizationCode() {
  return "wac_" + randomBytes(32).toString("base64url");
}

export function randomAccessToken() {
  return "waa_" + randomBytes(32).toString("base64url");
}

export function randomRefreshToken() {
  return "war_" + randomBytes(48).toString("base64url");
}

export function accessTokenExpiresAt(now = new Date()) {
  return new Date(now.getTime() + ACCESS_TOKEN_TTL_SECONDS * 1000);
}

export function refreshTokenExpiresAt(now = new Date()) {
  return new Date(now.getTime() + REFRESH_TOKEN_TTL_SECONDS * 1000);
}

export function authorizationCodeExpiresAt(now = new Date()) {
  return new Date(now.getTime() + AUTH_CODE_TTL_SECONDS * 1000);
}

export function accessTokenExpiresInSeconds() {
  return ACCESS_TOKEN_TTL_SECONDS;
}

export function oauthErrorCode(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if ([
    "unsupported_response_type",
    "unauthorized_client",
    "invalid_request",
    "invalid_target",
    "required_scope_missing",
    "unsupported_scope",
  ].includes(message)) return message === "required_scope_missing" || message === "unsupported_scope" ? "invalid_scope" : message;
  return "invalid_request";
}

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
