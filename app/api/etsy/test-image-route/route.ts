import { NextRequest, NextResponse } from "next/server";
import { deflateSync } from "node:zlib";
import { ETSY_SESSION_COOKIE_OPTIONS, etsyHeaders, getOwnedEtsyShop, getValidEtsySession } from "../../../../lib/etsy-client";

export const dynamic = "force-dynamic";

const TEST_TITLE = "Warlock Image Route Test — Delete Me";

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

function makeTestPng(width = 1600, height = 1600) {
  const rows: Buffer[] = [];
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(1 + width * 3);
    row[0] = 0;
    for (let x = 0; x < width; x += 1) {
      const offset = 1 + x * 3;
      row[offset] = (111 + Math.floor(x / 8) + Math.floor(y / 17)) % 256;
      row[offset + 1] = (38 + Math.floor(y / 6)) % 256;
      row[offset + 2] = (61 + Math.floor(x / 5)) % 256;
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(Buffer.concat(rows), { level: 7 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

type TaxonomyNode = { id?: number; name?: string; children?: TaxonomyNode[] };
type EtsyDraft = { listing_id?: number; title?: string; state?: string; creation_timestamp?: number };

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

function failed(stage: string, error: string, details: unknown, status = 502, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, stage, error, details, published: false, ...extra }, { status });
}

export async function POST(request: NextRequest) {
  const cookieValue = request.cookies.get("etsy_session")?.value;
  if (!cookieValue) return failed("session", "etsy_not_connected", null, 401);

  try {
    const auth = await getValidEtsySession(cookieValue);
    const shop = await getOwnedEtsyShop(auth.session.access_token);
    const shopId = Number(shop?.shop_id);
    if (!shopId) return failed("shop", "etsy_shop_id_missing", shop);
    const headers = etsyHeaders(auth.session.access_token);

    const draftsResponse = await fetch(`https://api.etsy.com/v3/application/shops/${shopId}/listings?state=draft&limit=50`, {
      headers,
      cache: "no-store",
    });
    const draftsPayload = await draftsResponse.json().catch(() => ({}));
    if (!draftsResponse.ok) return failed("draft_lookup", "draft_lookup_failed", draftsPayload, draftsResponse.status);

    const matchingDrafts = (Array.isArray(draftsPayload?.results) ? draftsPayload.results : [])
      .filter((item: EtsyDraft) => (item.title ?? "").toLowerCase().includes("warlock image route test"))
      .sort((a: EtsyDraft, b: EtsyDraft) => (b.creation_timestamp ?? 0) - (a.creation_timestamp ?? 0));

    let listing: EtsyDraft | Record<string, unknown> = matchingDrafts[0] ?? {};
    let listingId = Number((listing as EtsyDraft).listing_id);
    let categoryLabel = "existing diagnostic draft";
    const reusedDraft = Boolean(listingId);

    if (!listingId) {
      const taxonomyResponse = await fetch("https://api.etsy.com/v3/application/seller-taxonomy/nodes", { headers, cache: "no-store" });
      const taxonomyPayload = await taxonomyResponse.json().catch(() => ({}));
      if (!taxonomyResponse.ok) return failed("taxonomy_lookup", "taxonomy_lookup_failed", taxonomyPayload, taxonomyResponse.status);
      const options = flatten(Array.isArray(taxonomyPayload?.results) ? taxonomyPayload.results : []);
      const category = options.find((item) => item.leaf && /template|stationery|printable/i.test(item.label)) ?? options.find((item) => item.leaf);
      if (!category) return failed("taxonomy_lookup", "no_valid_taxonomy_leaf", taxonomyPayload);
      categoryLabel = category.label;

      const listingBody = new URLSearchParams({
        quantity: "1",
        title: TEST_TITLE,
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
      listing = await listingResponse.json().catch(() => ({}));
      if (!listingResponse.ok) return failed("draft_creation", "draft_creation_failed", listing, listingResponse.status, { category: categoryLabel });
      listingId = Number((listing as EtsyDraft).listing_id);
      if (!listingId) return failed("draft_creation", "listing_id_missing", listing, 502, { category: categoryLabel });
    }

    const existingImagesResponse = await fetch(`https://api.etsy.com/v3/application/listings/${listingId}/images`, { headers, cache: "no-store" });
    const existingImages = await existingImagesResponse.json().catch(() => ({}));
    if (!existingImagesResponse.ok) return failed("preflight_image_lookup", "image_lookup_failed", existingImages, existingImagesResponse.status, { listingId, reusedDraft });
    const existingImageCount = Array.isArray(existingImages?.results) ? existingImages.results.length : 0;

    if (existingImageCount > 0) {
      const result = NextResponse.json({
        ok: true,
        stage: "already_uploaded",
        listingId,
        state: (listing as EtsyDraft).state ?? "draft",
        category: categoryLabel,
        imageCount: existingImageCount,
        imageId: existingImages.results?.[0]?.listing_image_id ?? null,
        reusedDraft,
        published: false,
      });
      if (auth.refreshedCookieValue) result.cookies.set("etsy_session", auth.refreshedCookieValue, ETSY_SESSION_COOKIE_OPTIONS);
      return result;
    }

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
      const result = failed("image_upload", "image_upload_failed", image, imageResponse.status, {
        listingId,
        state: (listing as EtsyDraft).state ?? "draft",
        category: categoryLabel,
        reusedDraft,
        generatedImageBytes: imageBytes.length,
      });
      if (auth.refreshedCookieValue) result.cookies.set("etsy_session", auth.refreshedCookieValue, ETSY_SESSION_COOKIE_OPTIONS);
      return result;
    }

    const verifyResponse = await fetch(`https://api.etsy.com/v3/application/listings/${listingId}/images`, { headers, cache: "no-store" });
    const verify = await verifyResponse.json().catch(() => ({}));
    if (!verifyResponse.ok) return failed("image_verify", "image_verify_failed", verify, verifyResponse.status, { listingId, reusedDraft });
    const imageCount = Array.isArray(verify?.results) ? verify.results.length : 0;

    const result = NextResponse.json({
      ok: imageCount > 0,
      stage: imageCount > 0 ? "verified" : "image_verify",
      error: imageCount > 0 ? undefined : "image_count_zero_after_upload",
      listingId,
      state: (listing as EtsyDraft).state ?? "draft",
      category: categoryLabel,
      imageCount,
      imageId: image?.listing_image_id ?? null,
      reusedDraft,
      generatedImageBytes: imageBytes.length,
      details: imageCount > 0 ? undefined : verify,
      published: false,
    });
    if (auth.refreshedCookieValue) result.cookies.set("etsy_session", auth.refreshedCookieValue, ETSY_SESSION_COOKIE_OPTIONS);
    return result;
  } catch (error) {
    console.error("Warlock image-route diagnostic failed", error);
    return failed("exception", "warlock_image_route_test_failed", error instanceof Error ? error.message : String(error));
  }
}
