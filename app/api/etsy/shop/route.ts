import { NextRequest, NextResponse } from "next/server";
import { ETSY_SESSION_COOKIE_OPTIONS } from "../../../../lib/etsy-client";
import { getEtsyRequestContext } from "../../../../lib/warlock-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const context = await getEtsyRequestContext(request);
    if (!context) return NextResponse.json({ connected: false, error: "etsy_not_connected" }, { status: 401 });
    const { auth, shop } = context;
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
