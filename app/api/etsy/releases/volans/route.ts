import { NextRequest, NextResponse } from "next/server";
import { ETSY_SESSION_COOKIE_OPTIONS, etsyHeaders } from "../../../../../lib/etsy-client";
import { getEtsyRequestContext } from "../../../../../lib/warlock-auth";
import { prisma } from "../../../../../lib/prisma";
import { ensureEtsyAiDisclosure } from "../../../../../lib/warlock-commerce/policy";

export const dynamic = "force-dynamic";

const PHYSICAL_VARIANTS = [
  { id: "spellmarkowlunframed8x10v1", label: "8×10 unframed", price: 24.00, sku: "SM-OWL-P1-V4463" },
  { id: "spellmarkowlunframedv1", label: "11×14 unframed", price: 28.00, sku: "SM-OWL-P1-V14125" },
  { id: "spellmarkowlframedv1", label: "11×14 black framed", price: 69.00, sku: "SM-OWL-P2-V14292" },
] as const;

type Input = {
  taxonomyId?: number;
  shippingProfileId?: number;
  readinessStateId?: number;
};

const positiveId = (value: unknown) => {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};

export async function POST(request: NextRequest) {
  const input = (await request.json().catch(() => ({}))) as Input;
  const taxonomyId = positiveId(input.taxonomyId);
  const shippingProfileId = positiveId(input.shippingProfileId);
  const readinessStateId = positiveId(input.readinessStateId);
  if (!taxonomyId || !shippingProfileId || !readinessStateId) {
    return NextResponse.json({ error: "taxonomy_shipping_processing_required" }, { status: 400 });
  }

  try {
    const context = await getEtsyRequestContext(request);
    if (!context) return NextResponse.json({ error: "etsy_not_connected" }, { status: 401 });
    const { auth, shopId } = context;

    const mapped = await prisma.spellmarkVariant.findMany({
      where: { id: { in: PHYSICAL_VARIANTS.map((v) => v.id) } },
      select: { id: true, etsyListingId: true },
    });
    const existingIds = [...new Set(mapped.map((v) => v.etsyListingId).filter((v): v is string => Boolean(v)))];
    if (existingIds.length === 1) {
      const existingId = existingIds[0];
      const verify = await fetch(`https://api.etsy.com/v3/application/listings/${existingId}`, {
        headers: etsyHeaders(auth.session.access_token), cache: "no-store",
      });
      if (verify.ok) {
        const listing = await verify.json();
        const response = NextResponse.json({ ok: true, existing: true, listing });
        if (auth.refreshedCookieValue) response.cookies.set("etsy_session", auth.refreshedCookieValue, ETSY_SESSION_COOKIE_OPTIONS);
        return response;
      }
    }

    const title = "VOLANS AETHEREUS — The Sky Wanderer | Medieval Manuscript Barn Owl Art Print | Cabinet of Curiosities";
    const description = ensureEtsyAiDisclosure([
      "VOLANS AETHEREUS — The Sky Wanderer is the flagship owl of Spellmark’s Cabinet of Curiosities collection.",
      "",
      "A naturalistic barn owl appears within a restrained illuminated-manuscript-inspired folio: parchment texture, celestial ornament, botanical flourishes, and gold-toned printed details. The gold appearance is part of the printed artwork; it is not metallic foil or hand gilding.",
      "",
      "Choose one physical edition:",
      "• 8×10 in unframed Enhanced Matte Paper Poster — $24",
      "• 11×14 in unframed Enhanced Matte Paper Poster — $28",
      "• 11×14 in Enhanced Matte Paper Framed Poster with BLACK Printful frame — $69",
      "",
      "Unframed editions do not include a frame. The framed edition includes only the available black Printful frame shown in the product imagery. Decorative props are not included.",
      "",
      "Print-on-demand fulfillment through Printful. Artwork master and production presentation approved September 25, 2026.",
    ].join("\n"));

    const body = new URLSearchParams({
      quantity: "999",
      title,
      description,
      price: "24.00",
      who_made: "i_did",
      when_made: "2020_2026",
      taxonomy_id: String(taxonomyId),
      is_supply: "false",
      should_auto_renew: "true",
      type: "physical",
      shipping_profile_id: String(shippingProfileId),
      readiness_state_id: String(readinessStateId),
      tags: [
        "barn owl print","medieval wall art","celestial owl","manuscript art","dark academia decor",
        "owl wall decor","nature illustration","gothic wall art","illuminated art","mystical owl",
        "curiosity cabinet","black framed print","Spellmark",
      ].join(","),
    });

    const createResponse = await fetch(`https://api.etsy.com/v3/application/shops/${shopId}/listings?legacy=false`, {
      method: "POST",
      headers: {
        ...etsyHeaders(auth.session.access_token),
        "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
      },
      body,
      cache: "no-store",
    });
    const listing = await createResponse.json().catch(() => ({}));
    if (!createResponse.ok) {
      return NextResponse.json({ error: "etsy_volans_draft_creation_failed", details: listing }, { status: createResponse.status });
    }

    const listingId = Number(listing?.listing_id);
    if (!listingId) return NextResponse.json({ error: "etsy_listing_id_missing" }, { status: 502 });

    const inventoryBody = {
      products: PHYSICAL_VARIANTS.map((variant) => ({
        sku: variant.sku,
        offerings: [{
          quantity: 999,
          price: variant.price,
          is_enabled: true,
          readiness_state_id: readinessStateId,
        }],
        property_values: [{
          property_id: 513,
          property_name: "Edition",
          scale_id: null,
          value_ids: [],
          values: [variant.label],
        }],
      })),
      price_on_property: [513],
      quantity_on_property: [],
      sku_on_property: [513],
      readiness_state_on_property: [],
    };

    const inventoryResponse = await fetch(`https://api.etsy.com/v3/application/listings/${listingId}/inventory?legacy=false`, {
      method: "PUT",
      headers: {
        ...etsyHeaders(auth.session.access_token),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(inventoryBody),
      cache: "no-store",
    });
    const inventory = await inventoryResponse.json().catch(() => ({}));
    if (!inventoryResponse.ok) {
      return NextResponse.json({
        error: "etsy_volans_inventory_failed",
        listingId,
        listing,
        details: inventory,
      }, { status: inventoryResponse.status });
    }

    await prisma.spellmarkVariant.updateMany({
      where: { id: { in: PHYSICAL_VARIANTS.map((v) => v.id) } },
      data: { etsyListingId: String(listingId) },
    });

    const response = NextResponse.json({
      ok: true,
      existing: false,
      listing,
      inventory,
      listingId,
      expectedImages: 11,
      state: listing?.state ?? "draft",
    }, { status: 201 });
    if (auth.refreshedCookieValue) response.cookies.set("etsy_session", auth.refreshedCookieValue, ETSY_SESSION_COOKIE_OPTIONS);
    return response;
  } catch (error) {
    console.error("Volans Etsy release route failed", error);
    return NextResponse.json({ error: "etsy_volans_release_failed" }, { status: 502 });
  }
}
