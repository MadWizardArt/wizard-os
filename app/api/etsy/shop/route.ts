import { NextRequest, NextResponse } from "next/server";
import { ETSY_SESSION_COOKIE_OPTIONS, getOwnedEtsyShop, getValidEtsySession } from "../../../../lib/etsy-client";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const cookieValue = request.cookies.get("etsy_session")?.value;
  if (!cookieValue) {
    return NextResponse.json({ connected: false, error: "etsy_not_connected" }, { status: 401 });
  }

  try {
    const auth = await getValidEtsySession(cookieValue);
    const shop = await getOwnedEtsyShop(auth.session.access_token);
    const response = NextResponse.json({ connected: true, shop });

    if (auth.refreshedCookieValue) {
      response.cookies.set("etsy_session", auth.refreshedCookieValue, ETSY_SESSION_COOKIE_OPTIONS);
    }

    return response;
  } catch (error) {
    console.error("Etsy shop verification failed", error);
    return NextResponse.json({ connected: false, error: "etsy_shop_verification_failed" }, { status: 502 });
  }
}
