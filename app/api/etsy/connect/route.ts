import { NextResponse } from "next/server";
import { ETSY_SCOPES, makePkcePair, makeState, requireEnv } from "../../../../lib/etsy";

export const dynamic = "force-dynamic";

export async function GET() {
  const clientId = requireEnv("ETSY_API_KEYSTRING");
  const redirectUri = requireEnv("ETSY_REDIRECT_URI");
  const { verifier, challenge } = makePkcePair();
  const state = makeState();

  const authUrl = new URL("https://www.etsy.com/oauth/connect");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", ETSY_SCOPES.join(" "));
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  const response = NextResponse.redirect(authUrl);
  const secure = process.env.NODE_ENV === "production";

  response.cookies.set("etsy_oauth_verifier", verifier, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 10 * 60,
  });
  response.cookies.set("etsy_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 10 * 60,
  });

  return response;
}
