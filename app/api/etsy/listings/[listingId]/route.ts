import { NextRequest, NextResponse } from "next/server";
import { ETSY_SESSION_COOKIE_OPTIONS, etsyHeaders, getOwnedEtsyShop, getValidEtsySession } from "../../../../../lib/etsy-client";

export const dynamic = "force-dynamic";

type UpdateInput = {
  title?: string;
  description?: string;
  price?: number;
  quantity?: number;
  tags?: string[];
};

export async function PATCH(request: NextRequest, context: { params: Promise<{ listingId: string }> }) {
  const cookieValue = request.cookies.get("etsy_session")?.value;
  if (!cookieValue) return NextResponse.json({ error: "etsy_not_connected" }, { status: 401 });

  const { listingId } = await context.params;
  if (!/^\d+$/.test(listingId)) return NextResponse.json({ error: "invalid_listing_id" }, { status: 400 });

  const input = (await request.json()) as UpdateInput;
  try {
    const auth = await getValidEtsySession(cookieValue);
    const shop = await getOwnedEtsyShop(auth.session.access_token);
    const shopId = Number(shop?.shop_id);
    if (!shopId) throw new Error("etsy_shop_id_missing");

    const body = new URLSearchParams();
    if (input.title) body.set("title", input.title);
    if (input.description) body.set("description", input.description);
    if (Number.isFinite(input.price)) body.set("price", Number(input.price).toFixed(2));
    if (Number.isFinite(input.quantity)) body.set("quantity", String(input.quantity));
    if (input.tags?.length) body.set("tags", input.tags.join(","));

    const response = await fetch(`https://api.etsy.com/v3/application/shops/${shopId}/listings/${listingId}`, {
      method: "PATCH",
      headers: { ...etsyHeaders(auth.session.access_token), "Content-Type": "application/x-www-form-urlencoded; charset=utf-8" },
      body,
      cache: "no-store",
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("Etsy listing update failed", response.status, payload);
      return NextResponse.json({ error: "etsy_listing_update_failed", details: payload }, { status: response.status });
    }

    const result = NextResponse.json({ ok: true, listing: payload });
    if (auth.refreshedCookieValue) result.cookies.set("etsy_session", auth.refreshedCookieValue, ETSY_SESSION_COOKIE_OPTIONS);
    return result;
  } catch (error) {
    console.error("Etsy listing update route failed", error);
    return NextResponse.json({ error: "etsy_listing_update_route_failed" }, { status: 502 });
  }
}
