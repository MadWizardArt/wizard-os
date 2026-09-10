import { decryptSession, encryptSession, EtsyTokenResponse, requireEnv } from "./etsy";

export type EtsySession = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
};

export type EtsyAuthResult = {
  session: EtsySession;
  refreshedCookieValue?: string;
};

export async function getValidEtsySession(cookieValue: string): Promise<EtsyAuthResult> {
  const session = decryptSession<EtsySession>(cookieValue);
  const refreshSkewMs = 5 * 60 * 1000;

  if (session.expires_at > Date.now() + refreshSkewMs) {
    return { session };
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: requireEnv("ETSY_API_KEYSTRING"),
    refresh_token: session.refresh_token,
  });

  const response = await fetch("https://api.etsy.com/v3/public/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    console.error("Etsy token refresh failed", response.status, text);
    throw new Error("etsy_token_refresh_failed");
  }

  const token = (await response.json()) as EtsyTokenResponse;
  const refreshed: EtsySession = {
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expires_at: Date.now() + token.expires_in * 1000,
  };

  return {
    session: refreshed,
    refreshedCookieValue: encryptSession(refreshed),
  };
}

export function etsyHeaders(accessToken: string) {
  return {
    "x-api-key": `${requireEnv("ETSY_API_KEYSTRING")}:${requireEnv("ETSY_SHARED_SECRET")}`,
    Authorization: `Bearer ${accessToken}`,
  };
}

export function etsyUserId(accessToken: string) {
  const userId = accessToken.split(".")[0];
  if (!userId || !/^\d+$/.test(userId)) throw new Error("invalid_etsy_access_token");
  return userId;
}

export async function getOwnedEtsyShop(accessToken: string) {
  const userId = etsyUserId(accessToken);
  const response = await fetch(`https://api.etsy.com/v3/application/users/${userId}/shops`, {
    headers: etsyHeaders(accessToken),
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    console.error("Etsy shop lookup failed", response.status, text);
    throw new Error("etsy_shop_lookup_failed");
  }

  return response.json();
}

export const ETSY_SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 90 * 24 * 60 * 60,
};
