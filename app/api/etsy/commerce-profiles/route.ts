import { NextRequest, NextResponse } from "next/server";
import { ETSY_SESSION_COOKIE_OPTIONS, etsyHeaders } from "../../../../lib/etsy-client";
import { getEtsyRequestContext } from "../../../../lib/warlock-auth";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };

export async function GET(request: NextRequest) {
  try {
    const context = await getEtsyRequestContext(request);
    if (!context) return NextResponse.json({ error: "etsy_not_connected" }, { status: 401, headers: noStore });
    const { auth, shopId } = context;
    const apiHeaders = etsyHeaders(auth.session.access_token);
    const shippingResponse = await fetch(`https://api.etsy.com/v3/application/shops/${shopId}/shipping-profiles`, { headers: apiHeaders, cache: "no-store" });
    const readinessResponse = await fetch(`https://api.etsy.com/v3/application/shops/${shopId}/readiness-state-definitions`, { headers: apiHeaders, cache: "no-store" });
    if (!shippingResponse.ok || !readinessResponse.ok) return NextResponse.json({ error: "etsy_commerce_profiles_failed" }, { status: 502, headers: noStore });
    const shipping = await shippingResponse.json();
    const readiness = await readinessResponse.json();
    const response = NextResponse.json({ shopId, shippingProfiles: shipping?.results ?? [], readinessProfiles: readiness?.results ?? [] }, { headers: noStore });
    if (auth.refreshedCookieValue) response.cookies.set("etsy_session", auth.refreshedCookieValue, ETSY_SESSION_COOKIE_OPTIONS);
    return response;
  } catch (error) {
    console.error("Etsy commerce profiles route failed", error);
    return NextResponse.json({ error: "etsy_commerce_profiles_failed" }, { status: 502, headers: noStore });
  }
}
