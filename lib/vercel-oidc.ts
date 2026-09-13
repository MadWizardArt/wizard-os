import { headers } from "next/headers";

type VercelRequestContext = {
  headers?: Record<string, string>;
};

const SYMBOL_FOR_REQ_CONTEXT = Symbol.for("@vercel/request-context");

/**
 * Resolve an AI Gateway credential for legacy/optional Museum AI.
 *
 * Museum 2.0 is zero-inference by default. Unless MUSEUM_AI_ENABLED=true,
 * this helper returns no credential and therefore prevents any Gateway call.
 *
 * When explicitly enabled, credential order is:
 * 1. Explicit AI_GATEWAY_API_KEY, if configured.
 * 2. Vercel's per-request OIDC token exposed through Next.js request headers.
 * 3. Vercel's runtime request-context symbol.
 * 4. VERCEL_OIDC_TOKEN, primarily useful for local/CLI environments.
 */
export async function getAiGatewayAuthToken(): Promise<string> {
  if (process.env.MUSEUM_AI_ENABLED?.trim().toLowerCase() !== "true") return "";

  const explicitKey = process.env.AI_GATEWAY_API_KEY?.trim();
  if (explicitKey) return explicitKey;

  try {
    const requestHeaders = await headers();
    const headerToken = requestHeaders.get("x-vercel-oidc-token")?.trim();
    if (headerToken) return headerToken;
  } catch {
    // A caller outside an active Next.js request may not have request headers.
  }

  const fromSymbol: typeof globalThis & {
    [SYMBOL_FOR_REQ_CONTEXT]?: { get?: () => VercelRequestContext };
  } = globalThis;

  const contextToken = fromSymbol[SYMBOL_FOR_REQ_CONTEXT]
    ?.get?.()
    .headers?.["x-vercel-oidc-token"]
    ?.trim();

  if (contextToken) return contextToken;
  return process.env.VERCEL_OIDC_TOKEN?.trim() ?? "";
}
