import type { NextRequest } from "next/server";

function firstHeaderValue(value: string | null) {
  return value?.split(",", 1)[0]?.trim() || "";
}

export function isSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    const supplied = new URL(origin);
    const directHost = request.headers.get("host") || request.nextUrl.host;
    const forwardedHost = firstHeaderValue(request.headers.get("x-forwarded-host"));
    const forwardedProtocol = firstHeaderValue(request.headers.get("x-forwarded-proto"));
    // Browsers control Origin and Host; exact host equality is the reliable
    // same-origin signal even when a local reverse proxy disagrees on scheme.
    const directMatch = supplied.host === directHost;
    const forwardedMatch = Boolean(forwardedHost && forwardedProtocol)
      && supplied.host === forwardedHost
      && supplied.protocol === `${forwardedProtocol}:`;
    return directMatch || forwardedMatch;
  } catch {
    return false;
  }
}
