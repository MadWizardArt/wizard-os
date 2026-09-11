import { NextRequest, NextResponse } from "next/server";
import { ETSY_SESSION_COOKIE_OPTIONS, etsyHeaders, getOwnedEtsyShop, getValidEtsySession } from "../../../../../../lib/etsy-client";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ listingId: string }> }) {
  const cookieValue = request.cookies.get("etsy_session")?.value;
  if (!cookieValue) return NextResponse.json({ error: "etsy_not_connected" }, { status: 401 });

  const { listingId } = await context.params;
  if (!/^\d+$/.test(listingId)) return NextResponse.json({ error: "invalid_listing_id" }, { status: 400 });

  try {
    const auth = await getValidEtsySession(cookieValue);
    const shop = await getOwnedEtsyShop(auth.session.access_token);
    const shopId = Number(shop?.shop_id);
    if (!shopId) throw new Error("etsy_shop_id_missing");

    const headers = etsyHeaders(auth.session.access_token);
    const [imagesResponse, filesResponse] = await Promise.all([
      fetch(`https://api.etsy.com/v3/application/listings/${listingId}/images`, { headers, cache: "no-store" }),
      fetch(`https://api.etsy.com/v3/application/shops/${shopId}/listings/${listingId}/files`, { headers, cache: "no-store" }),
    ]);

    const images = await imagesResponse.json().catch(() => ({}));
    const files = await filesResponse.json().catch(() => ({}));

    if (!imagesResponse.ok || !filesResponse.ok) {
      console.error("Etsy readiness lookup failed", imagesResponse.status, filesResponse.status, images, files);
      return NextResponse.json({ error: "etsy_readiness_lookup_failed", images, files }, { status: 502 });
    }

    const imageCount = Array.isArray(images?.results) ? images.results.length : 0;
    const fileCount = Array.isArray(files?.results) ? files.results.length : 0;
    const result = NextResponse.json({
      ok: true,
      listingId: Number(listingId),
      imageCount,
      fileCount,
      hasImage: imageCount > 0,
      hasDigitalFile: fileCount > 0,
      readyForHumanReview: imageCount > 0 && fileCount > 0,
    });

    if (auth.refreshedCookieValue) result.cookies.set("etsy_session", auth.refreshedCookieValue, ETSY_SESSION_COOKIE_OPTIONS);
    return result;
  } catch (error) {
    console.error("Etsy readiness route failed", error);
    return NextResponse.json({ error: "etsy_readiness_route_failed" }, { status: 502 });
  }
}
