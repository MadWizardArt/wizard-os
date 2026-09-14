import { NextRequest, NextResponse } from "next/server";
import { deflateSync } from "node:zlib";
import { ETSY_SESSION_COOKIE_OPTIONS, etsyHeaders, getOwnedEtsyShop, getValidEtsySession } from "../../../../lib/etsy-client";

export const dynamic = "force-dynamic";

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function makeTestPng(width = 1200, height = 1200) {
  const row = Buffer.alloc(1 + width * 3);
  row[0] = 0;
  for (let x = 0; x < width; x += 1) {
    const offset = 1 + x * 3;
    row[offset] = 111;
    row[offset + 1] = 38;
    row[offset + 2] = 61;
  }
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

type TaxonomyNode = { id?: number; name?: string; children?: TaxonomyNode[] };

function flatten(nodes: TaxonomyNode[], parents: string[] = []): Array<{ id: number; label: string; leaf: boolean }> {
  return nodes.flatMap((node) => {
    if (!node.id || !node.name) return [];
    const path = [...parents, node.name];
    const children = node.children ?? [];
    return [
      { id: node.id, label: path.join(" > "), leaf: children.length === 0 },
      ...flatten(children, path),
    ];
  });
}

export async function POST(request: NextRequest) {
  const cookieValue = request.cookies.get("etsy_session")?.value;
  if (!cookieValue) return NextResponse.json({ error: "etsy_not_connected" }, { status: 401 });

  try {
    const auth = await getValidEtsySession(cookieValue);
    const shop = await getOwnedEtsyShop(auth.session.access_token);
    const shopId = Number(shop?.shop_id);
    if (!shopId) throw new Error("etsy_shop_id_missing");
    const headers = etsyHeaders(auth.session.access_token);

    const taxonomyResponse = await fetch("https://api.etsy.com/v3/application/seller-taxonomy/nodes", { headers, cache: "no-store" });
    const taxonomyPayload = await taxonomyResponse.json().catch(() => ({}));
    if (!taxonomyResponse.ok) return NextResponse.json({ error: "taxonomy_lookup_failed", details: taxonomyPayload }, { status: taxonomyResponse.status });
    const options = flatten(Array.isArray(taxonomyPayload?.results) ? taxonomyPayload.results : []);
    const category = options.find((item) => item.leaf && /template|stationery|printable/i.test(item.label)) ?? options.find((item) => item.leaf);
    if (!category) return NextResponse.json({ error: "no_valid_taxonomy_leaf" }, { status: 502 });

    const listingBody = new URLSearchParams({
      quantity: "1",
      title: "WARLOCK IMAGE ROUTE TEST — DELETE ME",
      description: "Internal Warlock API image-upload test. Not for sale. Safe to delete.",
      price: "1.00",
      who_made: "i_did",
      when_made: "2020_2026",
      taxonomy_id: String(category.id),
      is_supply: "false",
      should_auto_renew: "false",
      type: "download",
      tags: "warlock-test",
    });

    const listingResponse = await fetch(`https://api.etsy.com/v3/application/shops/${shopId}/listings`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded; charset=utf-8" },
      body: listingBody,
      cache: "no-store",
    });
    const listing = await listingResponse.json().catch(() => ({}));
    if (!listingResponse.ok) return NextResponse.json({ error: "draft_creation_failed", details: listing }, { status: listingResponse.status });
    const listingId = Number(listing?.listing_id);
    if (!listingId) return NextResponse.json({ error: "listing_id_missing", listing }, { status: 502 });

    const imageBytes = makeTestPng();
    const imageForm = new FormData();
    imageForm.set("image", new Blob([imageBytes], { type: "image/png" }), "warlock-image-route-test.png");
    imageForm.set("rank", "1");

    const imageResponse = await fetch(`https://api.etsy.com/v3/application/shops/${shopId}/listings/${listingId}/images`, {
      method: "POST",
      headers,
      body: imageForm,
      cache: "no-store",
    });
    const image = await imageResponse.json().catch(() => ({}));
    if (!imageResponse.ok) {
      const result = NextResponse.json({ ok: false, listingId, state: listing?.state ?? "draft", category: category.label, error: "image_upload_failed", details: image }, { status: imageResponse.status });
      if (auth.refreshedCookieValue) result.cookies.set("etsy_session", auth.refreshedCookieValue, ETSY_SESSION_COOKIE_OPTIONS);
      return result;
    }

    const verifyResponse = await fetch(`https://api.etsy.com/v3/application/listings/${listingId}/images`, { headers, cache: "no-store" });
    const verify = await verifyResponse.json().catch(() => ({}));
    const imageCount = Array.isArray(verify?.results) ? verify.results.length : 0;

    const result = NextResponse.json({
      ok: imageResponse.ok && verifyResponse.ok && imageCount > 0,
      listingId,
      state: listing?.state ?? "draft",
      category: category.label,
      imageCount,
      imageId: image?.listing_image_id ?? null,
      published: false,
    });
    if (auth.refreshedCookieValue) result.cookies.set("etsy_session", auth.refreshedCookieValue, ETSY_SESSION_COOKIE_OPTIONS);
    return result;
  } catch (error) {
    console.error("Warlock image-route diagnostic failed", error);
    return NextResponse.json({ error: "warlock_image_route_test_failed" }, { status: 502 });
  }
}
