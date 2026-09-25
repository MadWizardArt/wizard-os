import { NextRequest, NextResponse } from "next/server";
import { ETSY_SESSION_COOKIE_OPTIONS, etsyHeaders } from "../../../../lib/etsy-client";
import { getEtsyRequestContext } from "../../../../lib/warlock-auth";
import { prisma } from "../../../../lib/prisma";
import { ensureEtsyAiDisclosure } from "../../../../lib/warlock-commerce/policy";

export const dynamic = "force-dynamic";

type DraftInput = {
  title?: string;
  description?: string;
  price?: number;
  quantity?: number;
  taxonomyId?: number;
  tags?: string[];
  listingType?: "download" | "physical";
  shippingProfileId?: number;
  readinessStateId?: number;
  productVariantId?: string;
};

const positiveId = (value: unknown) => {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};

export async function POST(request: NextRequest) {
  const input = (await request.json()) as DraftInput;
  if (!input.title || !input.description || !input.price || !input.taxonomyId) {
    return NextResponse.json({ error: "missing_required_fields" }, { status: 400 });
  }

  const listingType = input.listingType === "physical" ? "physical" : "download";
  const shippingProfileId = positiveId(input.shippingProfileId);
  const readinessStateId = positiveId(input.readinessStateId);
  if (listingType === "physical" && (!shippingProfileId || !readinessStateId)) {
    return NextResponse.json({ error: "physical_profile_required" }, { status: 400 });
  }
  if (input.productVariantId && !/^[a-z0-9]{15,40}$/.test(input.productVariantId)) {
    return NextResponse.json({ error: "invalid_product_variant_id" }, { status: 400 });
  }

  try {
    const context = await getEtsyRequestContext(request);
    if (!context) return NextResponse.json({ error: "etsy_not_connected" }, { status: 401 });
    const { auth, shopId } = context;

    const body = new URLSearchParams({
      quantity: String(input.quantity ?? 999),
      title: input.title,
      description: ensureEtsyAiDisclosure(input.description),
      price: input.price.toFixed(2),
      who_made: "i_did",
      when_made: "2020_2026",
      taxonomy_id: String(input.taxonomyId),
      is_supply: "false",
      should_auto_renew: "true",
      type: listingType,
    });
    if (listingType === "physical") {
      body.set("shipping_profile_id", String(shippingProfileId));
      body.set("readiness_state_id", String(readinessStateId));
    }
    if (input.tags?.length) body.set("tags", input.tags.join(","));

    const suffix = listingType === "physical" ? "?legacy=false" : "";
    const etsyResponse = await fetch(`https://api.etsy.com/v3/application/shops/${shopId}/listings${suffix}`, {
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

    let variantLinked = false;
    const listingId = Number(payload?.listing_id);
    if (input.productVariantId && listingId) {
      try {
        const linked = await prisma.spellmarkVariant.updateMany({
          where: { id: input.productVariantId },
          data: { etsyListingId: String(listingId) },
        });
        variantLinked = linked.count === 1;
      } catch (linkError) {
        console.error("Spellmark variant Etsy link failed", linkError);
      }
    }

    const response = NextResponse.json({ ok: true, listing: payload, variantLinked }, { status: 201 });
    if (auth.refreshedCookieValue) {
      response.cookies.set("etsy_session", auth.refreshedCookieValue, ETSY_SESSION_COOKIE_OPTIONS);
    }
    return response;
  } catch (error) {
    console.error("Etsy draft route failed", error);
    return NextResponse.json({ error: "etsy_draft_route_failed" }, { status: 502 });
  }
}
