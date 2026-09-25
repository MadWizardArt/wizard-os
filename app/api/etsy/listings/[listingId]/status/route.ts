import { NextRequest, NextResponse } from "next/server";
import { ETSY_SESSION_COOKIE_OPTIONS, etsyHeaders } from "../../../../../../lib/etsy-client";
import { getEtsyRequestContext } from "../../../../../../lib/warlock-auth";
import { prisma } from "../../../../../../lib/prisma";
import { SPELLMARK_RELEASE_REQUIREMENTS } from "../../../../../../lib/spellmark-release-assets";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, routeContext: { params: Promise<{ listingId: string }> }) {
  const { listingId } = await routeContext.params;
  if (!/^\d+$/.test(listingId)) return NextResponse.json({ error: "invalid_listing_id" }, { status: 400 });

  try {
    const requestContext = await getEtsyRequestContext(request);
    if (!requestContext) return NextResponse.json({ error: "etsy_not_connected" }, { status: 401 });
    const { auth, shopId } = requestContext;
    const headers = etsyHeaders(auth.session.access_token);

    const [listingResponse, imagesResponse, filesResponse, variants] = await Promise.all([
      fetch(`https://api.etsy.com/v3/application/listings/${listingId}`, { headers, cache: "no-store" }),
      fetch(`https://api.etsy.com/v3/application/listings/${listingId}/images`, { headers, cache: "no-store" }),
      fetch(`https://api.etsy.com/v3/application/shops/${shopId}/listings/${listingId}/files`, { headers, cache: "no-store" }),
      prisma.spellmarkVariant.findMany({ where: { etsyListingId: listingId }, select: { id: true } }),
    ]);

    const listing = await listingResponse.json().catch(() => ({}));
    const images = await imagesResponse.json().catch(() => ({}));
    const files = await filesResponse.json().catch(() => ({}));
    const listingType = String(listing?.type ?? listing?.listing_type ?? "");
    const needsDigitalFile = listingType === "download";

    if (!listingResponse.ok || !imagesResponse.ok || (needsDigitalFile && !filesResponse.ok)) {
      console.error("Etsy readiness lookup failed", listingResponse.status, imagesResponse.status, filesResponse.status);
      return NextResponse.json({ error: "etsy_readiness_lookup_failed" }, { status: 502 });
    }

    const imageCount = Array.isArray(images?.results) ? images.results.length : 0;
    const fileCount = filesResponse.ok && Array.isArray(files?.results) ? files.results.length : 0;
    const variantIds = variants.map((variant) => variant.id);
    const physicalVolansIds = ["spellmarkowlunframed8x10v1", "spellmarkowlunframedv1", "spellmarkowlframedv1"];
    const isVolansPhysicalLineup = physicalVolansIds.every((id) => variantIds.includes(id));
    const requirement = isVolansPhysicalLineup
      ? { imageCount: 11, digitalFileCount: 0, label: "VOLANS AETHEREUS — Physical lineup" }
      : variantIds.map((id) => SPELLMARK_RELEASE_REQUIREMENTS[id]).find(Boolean);
    const requiredImageCount = requirement?.imageCount ?? 1;
    const requiredFileCount = requirement?.digitalFileCount ?? (needsDigitalFile ? 1 : 0);

    const result = NextResponse.json({
      ok: true,
      listingId: Number(listingId),
      listingType,
      variantId: variantIds[0] ?? null,
      variantIds,
      releaseLabel: requirement?.label ?? null,
      imageCount,
      fileCount,
      requiredImageCount,
      requiredFileCount,
      hasImage: imageCount > 0,
      hasDigitalFile: fileCount > 0,
      readyForHumanReview: imageCount >= requiredImageCount && fileCount >= requiredFileCount,
    });

    if (auth.refreshedCookieValue) result.cookies.set("etsy_session", auth.refreshedCookieValue, ETSY_SESSION_COOKIE_OPTIONS);
    return result;
  } catch (error) {
    console.error("Etsy readiness route failed", error);
    return NextResponse.json({ error: "etsy_readiness_route_failed" }, { status: 502 });
  }
}
