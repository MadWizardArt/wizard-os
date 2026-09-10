import { NextRequest, NextResponse } from "next/server";
import { ETSY_SESSION_COOKIE_OPTIONS, etsyHeaders, getOwnedEtsyShop, getValidEtsySession } from "../../../../lib/etsy-client";

export const dynamic = "force-dynamic";

type DraftInput = {
  title?: string;
  description?: string;
  price?: number;
  quantity?: number;
  taxonomyId?: number;
  tags?: string[];
};

export async function POST(request: NextRequest) {
  const cookieValue = request.cookies.get("etsy_session")?.value;
  if (!cookieValue) {
    return NextResponse.json({ error: "etsy_not_connected" }, { status: 401 });
  }

  const input = (await request.json()) as DraftInput;
  if (!input.title || !input.description || !input.price || !input.taxonomyId) {
    return NextResponse.json({ error: "missing_required_fields" }, { status: 400 });
  }

  try {
    const auth = await getValidEtsySession(cookieValue);
    const shop = await getOwnedEtsyShop(auth.session.access_token);
    const shopId = Number(shop?.shop_id);
    if (!shopId) throw new Error("etsy_shop_id_missing");

    const body = new URLSearchParams({
      quantity: String(input.quantity ?? 999),
      title: input.title,
      description: input.description,
      price: input.price.toFixed(2),
      who_made: "i_did",
      when_made: "2020_2026",
      taxonomy_id: String(input.taxonomyId),
      is_supply: "false",
      should_auto_renew: "true",
      type: "download",
    });

    if (input.tags?.length) body.set("tags", input.tags.join(","));

    const etsyResponse = await fetch(`https://api.etsy.com/v3/application/shops/${shopId}/listings`, {
      method: "POST",
      headers: {
        ...etsyHeaders(auth.session.access_token),
        "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
      },
      body,
      cache: "no-store",
    });

    const payload = await etsyResponse.json().catch(() => ({}));
    if (!etsyResponse.ok) {
      console.error("Etsy draft creation failed", etsyResponse.status, payload);
      return NextResponse.json({ error: "etsy_draft_creation_failed", details: payload }, { status: etsyResponse.status });
    }

    const response = NextResponse.json({ ok: true, listing: payload }, { status: 201 });
    if (auth.refreshedCookieValue) {
      response.cookies.set("etsy_session", auth.refreshedCookieValue, ETSY_SESSION_COOKIE_OPTIONS);
    }
    return response;
  } catch (error) {
    console.error("Etsy draft route failed", error);
    return NextResponse.json({ error: "etsy_draft_route_failed" }, { status: 502 });
  }
}
