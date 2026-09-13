type VercelRequestContext = {
  headers?: Record<string, string>;
};

const SYMBOL_FOR_REQ_CONTEXT = Symbol.for("@vercel/request-context");

/**
 * Resolve an AI Gateway credential without storing a new secret in Wizard OS.
 *
 * Production order:
 * 1. Explicit AI_GATEWAY_API_KEY, if one is configured.
 * 2. Vercel's per-request OIDC token from the runtime request context.
 * 3. VERCEL_OIDC_TOKEN, primarily useful for local/CLI environments.
 *
 * The request-context lookup mirrors the mechanism used by Vercel's official
 * @vercel/oidc helper, while keeping Wizard OS dependency-free here.
 */
export function getAiGatewayAuthToken(): string {
  const explicitKey = process.env.AI_GATEWAY_API_KEY?.trim();
  if (explicitKey) return explicitKey;

  const fromSymbol: typeof globalThis & {
    [SYMBOL_FOR_REQ_CONTEXT]?: { get?: () => VercelRequestContext };
  } = globalThis;

  const requestToken = fromSymbol[SYMBOL_FOR_REQ_CONTEXT]
    ?.get?.()
    .headers?.["x-vercel-oidc-token"]
    ?.trim();

  if (requestToken) return requestToken;
  return process.env.VERCEL_OIDC_TOKEN?.trim() ?? "";
}
