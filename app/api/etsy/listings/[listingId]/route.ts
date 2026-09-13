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

function validateListingId(listingId: string) {
  return /^\d+$/.test(listingId);
}

async function getAuthContext(request: NextRequest) {
  const cookieValue = request.cookies.get("etsy_session")?.value;
  if (!cookieValue) return null;
  const auth = await getValidEtsySession(cookieValue);
  const shop = await getOwnedEtsyShop(auth.session.access_token);
  const shopId = Number(shop?.shop_id);
  if (!shopId) throw new Error("etsy_shop_id_missing");
  return { auth, shopId };
}

export async function GET(request: NextRequest, context: { params: Promise<{ listingId: string }> }) {
  const { listingId } = await context.params;
  if (!validateListingId(listingId)) return NextResponse.json({ error: "invalid_listing_id" }, { status: 400 });

  try {
    const authContext = await getAuthContext(request);
    if (!authContext) return NextResponse.json({ error: "etsy_not_connected" }, { status: 401 });
    const { auth } = authContext;

    const response = await fetch(`https://api.etsy.com/v3/application/listings/${listingId}`, {
      headers: etsyHeaders(auth.session.access_token),
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json({ error: "etsy_listing_lookup_failed", details: payload }, { status: response.status });
    }

    const result = NextResponse.json({ listing: payload });
    if (auth.refreshedCookieValue) result.cookies.set("etsy_session", auth.refreshedCookieValue, ETSY_SESSION_COOKIE_OPTIONS);
    return result;
  } catch (error) {
    console.error("Etsy listing lookup route failed", error);
    return NextResponse.json({ error: "etsy_listing_lookup_route_failed" }, { status: 502 });
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ listingId: string }> }) {
  const { listingId } = await context.params;
  if (!validateListingId(listingId)) return NextResponse.json({ error: "invalid_listing_id" }, { status: 400 });

  const input = (await request.json()) as UpdateInput;
  try {
    const authContext = await getAuthContext(request);
    if (!authContext) return NextResponse.json({ error: "etsy_not_connected" }, { status: 401 });
    const { auth, shopId } = authContext;

    const body = new URLSearchParams();
    if (input.title !== undefined) body.set("title", input.title);
    if (input.description !== undefined) body.set("description", input.description);
    if (Number.isFinite(input.price)) body.set("price", Number(input.price).toFixed(2));
    if (Number.isFinite(input.quantity)) body.set("quantity", String(input.quantity));
    if (input.tags) body.set("tags", input.tags.join(","));

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
