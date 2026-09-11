import { NextRequest, NextResponse } from "next/server";
import { ETSY_SESSION_COOKIE_OPTIONS, etsyHeaders, getOwnedEtsyShop, getValidEtsySession } from "../../../../../../lib/etsy-client";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: { params: Promise<{ listingId: string }> }) {
  const cookieValue = request.cookies.get("etsy_session")?.value;
  if (!cookieValue) return NextResponse.json({ error: "etsy_not_connected" }, { status: 401 });

  const { listingId } = await context.params;
  if (!/^\d+$/.test(listingId)) return NextResponse.json({ error: "invalid_listing_id" }, { status: 400 });

  const incoming = await request.formData();
  const image = incoming.get("image");
  if (!(image instanceof File)) return NextResponse.json({ error: "image_required" }, { status: 400 });

  try {
    const auth = await getValidEtsySession(cookieValue);
    const shop = await getOwnedEtsyShop(auth.session.access_token);
    const shopId = Number(shop?.shop_id);
    if (!shopId) throw new Error("etsy_shop_id_missing");

    const body = new FormData();
    body.set("image", image, image.name);
    const rank = incoming.get("rank");
    if (typeof rank === "string" && rank) body.set("rank", rank);

    const response = await fetch(`https://api.etsy.com/v3/application/shops/${shopId}/listings/${listingId}/images`, {
      method: "POST",
      headers: etsyHeaders(auth.session.access_token),
      body,
      cache: "no-store",
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("Etsy image upload failed", response.status, payload);
      return NextResponse.json({ error: "etsy_image_upload_failed", details: payload }, { status: response.status });
    }

    const result = NextResponse.json({ ok: true, image: payload }, { status: 201 });
    if (auth.refreshedCookieValue) result.cookies.set("etsy_session", auth.refreshedCookieValue, ETSY_SESSION_COOKIE_OPTIONS);
    return result;
  } catch (error) {
    console.error("Etsy image upload route failed", error);
    return NextResponse.json({ error: "etsy_image_upload_route_failed" }, { status: 502 });
  }
}
