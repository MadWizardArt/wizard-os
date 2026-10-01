import { NextRequest, NextResponse } from "next/server";
import { verifyArtistSession } from "./lib/museum-artist-auth";
import { isSameOrigin } from "./lib/request-security";

const PUBLIC_API_PATHS = new Set([
  "/api/health",
  "/api/museum/artist-session",
]);

const INDEPENDENTLY_AUTHENTICATED_PREFIXES = [
  "/api/etsy/",
  "/api/grotto/",
  "/api/museum/knowledge/intake",
  "/api/printful",
  "/api/warlock/",
];

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const ORIGIN_EXEMPT_MUTATIONS = new Set([
  // OAuth consent has its own operator-key, client, redirect, state, and PKCE
  // validation and may sit behind a connector-facing reverse proxy.
  "/api/warlock/oauth/authorize",
]);

function hasIndependentAuthentication(pathname: string) {
  return INDEPENDENTLY_AUTHENTICATED_PREFIXES.some(
    (prefix) => pathname === prefix.replace(/\/$/, "") || pathname.startsWith(prefix),
  );
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_API_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  if (
    !READ_METHODS.has(request.method)
    && !ORIGIN_EXEMPT_MUTATIONS.has(pathname)
    && !isSameOrigin(request)
  ) {
    return NextResponse.json(
      { error: "Same-origin Artist action required." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (hasIndependentAuthentication(pathname)) {
    return NextResponse.next();
  }

  if (!verifyArtistSession(request)) {
    return NextResponse.json(
      { error: "Artist session required." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
  runtime: "nodejs",
};
