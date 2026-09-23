import { NextRequest, NextResponse } from "next/server";
import { ETSY_SESSION_COOKIE_OPTIONS, etsyHeaders } from "../../../../../../lib/etsy-client";
import { getEtsyRequestContext } from "../../../../../../lib/warlock-auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: { params: Promise<{ listingId: string }> }) {
  const { listingId } = await context.params;
  if (!/^\d+$/.test(listingId)) return NextResponse.json({ error: "invalid_listing_id" }, { status: 400 });

  const incoming = await request.formData();
  const file = incoming.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "file_required" }, { status: 400 });

  try {
    const context = await getEtsyRequestContext(request);
    if (!context) return NextResponse.json({ error: "etsy_not_connected" }, { status: 401 });
    const { auth, shopId } = context;

    const body = new FormData();
    body.set("file", file, file.name);
    body.set("name", file.name);

    const response = await fetch(`https://api.etsy.com/v3/application/shops/${shopId}/listings/${listingId}/files`, {
      method: "POST",
      headers: etsyHeaders(auth.session.access_token),
      body,
      cache: "no-store",
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("Etsy file upload failed", response.status, payload);
      return NextResponse.json({ error: "etsy_file_upload_failed", details: payload }, { status: response.status });
    }

    const result = NextResponse.json({ ok: true, file: payload }, { status: 201 });
    if (auth.refreshedCookieValue) result.cookies.set("etsy_session", auth.refreshedCookieValue, ETSY_SESSION_COOKIE_OPTIONS);
    return result;
  } catch (error) {
    console.error("Etsy file upload route failed", error);
    return NextResponse.json({ error: "etsy_file_upload_route_failed" }, { status: 502 });
  }
}
