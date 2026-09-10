import { NextRequest, NextResponse } from "next/server";
import { encryptSession, EtsyTokenResponse, requireEnv } from "../../../../lib/etsy";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const returnedState = request.nextUrl.searchParams.get("state");
  const error = request.nextUrl.searchParams.get("error");
  const storedVerifier = request.cookies.get("etsy_oauth_verifier")?.value;
  const storedState = request.cookies.get("etsy_oauth_state")?.value;

  if (error) {
    return NextResponse.redirect(new URL(`/etsy?status=error&reason=${encodeURIComponent(error)}`, request.url));
  }

  if (!code || !storedVerifier || !returnedState || !storedState || returnedState !== storedState) {
    return NextResponse.redirect(new URL("/etsy?status=error&reason=oauth_validation_failed", request.url));
  }

  const clientId = requireEnv("ETSY_API_KEYSTRING");
  const redirectUri = requireEnv("ETSY_REDIRECT_URI");

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    redirect_uri: redirectUri,
    code,
    code_verifier: storedVerifier,
  });

  const tokenResponse = await fetch("https://api.etsy.com/v3/public/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });

  if (!tokenResponse.ok) {
    const text = await tokenResponse.text();
    console.error("Etsy token exchange failed", tokenResponse.status, text);
    return NextResponse.redirect(new URL("/etsy?status=error&reason=token_exchange_failed", request.url));
  }

  const token = (await tokenResponse.json()) as EtsyTokenResponse;
  const session = encryptSession({
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expires_at: Date.now() + token.expires_in * 1000,
  });

  const response = NextResponse.redirect(new URL("/etsy?status=connected", request.url));
  const secure = process.env.NODE_ENV === "production";
  response.cookies.set("etsy_session", session, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 90 * 24 * 60 * 60,
  });
  response.cookies.delete("etsy_oauth_verifier");
  response.cookies.delete("etsy_oauth_state");
  return response;
}
