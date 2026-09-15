import { headers } from "next/headers";

type VercelRequestContext = {
  headers?: Record<string, string>;
};

const SYMBOL_FOR_REQ_CONTEXT = Symbol.for("@vercel/request-context");

/**
 * Resolve the credential Vercel AI Gateway expects for a server-side request.
 *
 * Credential order:
 * 1. Explicit AI_GATEWAY_API_KEY, if configured.
 * 2. Vercel's per-request OIDC token exposed through Next.js request headers.
 * 3. Vercel's runtime request-context symbol.
 * 4. VERCEL_OIDC_TOKEN, primarily useful for local/CLI environments.
 *
 * This resolver does not decide whether a feature is allowed to spend AI fuel;
 * callers must enforce their own feature/Artist gates before invoking it.
 */
export async function resolveAiGatewayAuthToken(): Promise<string> {
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
