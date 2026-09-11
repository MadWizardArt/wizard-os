import { NextRequest, NextResponse } from "next/server";
import { ETSY_SESSION_COOKIE_OPTIONS, etsyHeaders, getValidEtsySession } from "../../../../lib/etsy-client";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const cookieValue = request.cookies.get("etsy_session")?.value;
  if (!cookieValue) return NextResponse.json({ error: "etsy_not_connected" }, { status: 401 });

  try {
    const auth = await getValidEtsySession(cookieValue);
    const response = await fetch("https://api.etsy.com/v3/application/seller-taxonomy/nodes", {
      headers: etsyHeaders(auth.session.access_token),
      cache: "no-store",
    });

    if (!response.ok) {
      const details = await response.text();
      console.error("Etsy taxonomy lookup failed", response.status, details);
      return NextResponse.json({ error: "etsy_taxonomy_lookup_failed" }, { status: response.status });
    }

    const data = await response.json();
    const result = NextResponse.json(data);
    if (auth.refreshedCookieValue) {
      result.cookies.set("etsy_session", auth.refreshedCookieValue, ETSY_SESSION_COOKIE_OPTIONS);
    }
    return result;
  } catch (error) {
    console.error("Etsy taxonomy route failed", error);
    return NextResponse.json({ error: "etsy_taxonomy_lookup_failed" }, { status: 500 });
  }
}
