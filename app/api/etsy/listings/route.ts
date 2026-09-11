import { NextRequest, NextResponse } from "next/server";
import { ETSY_SESSION_COOKIE_OPTIONS, etsyHeaders, getOwnedEtsyShop, getValidEtsySession } from "../../../../lib/etsy-client";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const cookieValue = request.cookies.get("etsy_session")?.value;
  if (!cookieValue) return NextResponse.json({ error: "etsy_not_connected" }, { status: 401 });

  try {
    const auth = await getValidEtsySession(cookieValue);
    const shop = await getOwnedEtsyShop(auth.session.access_token);
    const shopId = Number(shop?.shop_id);
    if (!shopId) throw new Error("etsy_shop_id_missing");

    const state = request.nextUrl.searchParams.get("state") || "draft";
    const response = await fetch(
      `https://api.etsy.com/v3/application/shops/${shopId}/listings?state=${encodeURIComponent(state)}&limit=50`,
      { headers: etsyHeaders(auth.session.access_token), cache: "no-store" }
    );

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("Etsy listings lookup failed", response.status, payload);
      return NextResponse.json({ error: "etsy_listings_lookup_failed", details: payload }, { status: response.status });
    }

    const result = NextResponse.json(payload);
    if (auth.refreshedCookieValue) result.cookies.set("etsy_session", auth.refreshedCookieValue, ETSY_SESSION_COOKIE_OPTIONS);
    return result;
  } catch (error) {
    console.error("Etsy listings route failed", error);
    return NextResponse.json({ error: "etsy_listings_route_failed" }, { status: 502 });
  }
}
