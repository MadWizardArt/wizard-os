import { NextRequest, NextResponse } from "next/server";
import { deflateSync } from "node:zlib";
import { prisma } from "../../../../lib/prisma";
import { etsyHeaders, getOwnedEtsyShop, getValidEtsySession } from "../../../../lib/etsy-client";

export const dynamic = "force-dynamic";

const TEST_TITLE = "TEST — ChatGPT Direct Etsy Draft — Do Not Publish";
const CONNECTION_ID = "primary";

function crc32(buf: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer) {
  const typeBuf = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

function makeTestPng() {
  const width = 1200;
  const height = 1200;
  const stride = width * 3 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    raw[row] = 0;
    for (let x = 0; x < width; x++) {
      const i = row + 1 + x * 3;
      const border = x < 28 || x >= width - 28 || y < 28 || y >= height - 28;
      const inner = x > 185 && x < 1015 && y > 185 && y < 1015;
      const c = border ? [56, 43, 34] : inner ? [218, 201, 166] : [237, 226, 203];
      raw[i] = c[0]; raw[i + 1] = c[1]; raw[i + 2] = c[2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

async function json(response: Response) {
  return response.json().catch(() => ({}));
}

export async function GET(request: NextRequest) {
  if (process.env.VERCEL_ENV !== "preview") {
    return NextResponse.json({ error: "preview_only" }, { status: 404 });
  }
  if (request.nextUrl.searchParams.get("run") !== "direct-test") {
    return NextResponse.json({ error: "missing_test_confirmation" }, { status: 400 });
  }

  try {
    const saved = await prisma.etsyConnection.findUnique({ where: { id: CONNECTION_ID } });
    if (!saved) return NextResponse.json({ error: "etsy_not_connected" }, { status: 401 });

    const auth = await getValidEtsySession(saved.encryptedSession);
    if (auth.refreshedCookieValue) {
      await prisma.etsyConnection.update({
        where: { id: CONNECTION_ID },
        data: { encryptedSession: auth.refreshedCookieValue },
      });
    }

    const shop = await getOwnedEtsyShop(auth.session.access_token);
    const shopId = Number(shop?.shop_id);
    const allowedShopId = Number(process.env.WARLOCK_SHOP_ID);
    if (!shopId || shopId !== allowedShopId) {
      return NextResponse.json({ error: "etsy_shop_not_allowed" }, { status: 403 });
    }

    const headers = etsyHeaders(auth.session.access_token);
    const draftsResponse = await fetch(
      `https://api.etsy.com/v3/application/shops/${shopId}/listings?state=draft&limit=100`,
      { headers, cache: "no-store" }
    );
    const drafts = await json(draftsResponse);
    if (!draftsResponse.ok) {
      return NextResponse.json({ error: "draft_lookup_failed", details: drafts }, { status: draftsResponse.status });
    }

    const existing = Array.isArray(drafts?.results)
      ? drafts.results.find((listing: any) => listing?.title === TEST_TITLE)
      : null;

    let listing = existing;
    let created = false;

    if (!listing) {
      const taxonomyId = Array.isArray(drafts?.results)
        ? Number(drafts.results.find((x: any) => Number(x?.taxonomy_id) > 0)?.taxonomy_id)
        : 0;
      if (!taxonomyId) {
        return NextResponse.json({ error: "no_taxonomy_seed_available" }, { status: 409 });
      }

      const body = new URLSearchParams({
        quantity: "1",
        title: TEST_TITLE,
        description: "Direct ChatGPT → Etsy API connectivity test. Unpublished. Safe to delete after verification.",
        price: "1.00",
        who_made: "i_did",
        when_made: "2020_2026",
        taxonomy_id: String(taxonomyId),
        is_supply: "false",
        should_auto_renew: "false",
        type: "download",
      });

      const createResponse = await fetch(
        `https://api.etsy.com/v3/application/shops/${shopId}/listings`,
        {
          method: "POST",
          headers: {
            ...headers,
            "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
          },
          body,
          cache: "no-store",
        }
      );
      listing = await json(createResponse);
      if (!createResponse.ok) {
        return NextResponse.json({ error: "draft_creation_failed", details: listing }, { status: createResponse.status });
      }
      created = true;
    }

    const listingId = Number(listing?.listing_id);
    if (!listingId) return NextResponse.json({ error: "listing_id_missing" }, { status: 502 });

    const currentImagesResponse = await fetch(
      `https://api.etsy.com/v3/application/listings/${listingId}/images`,
      { headers, cache: "no-store" }
    );
    const currentImages = await json(currentImagesResponse);
    if (!currentImagesResponse.ok) {
      return NextResponse.json({ error: "image_lookup_failed", details: currentImages }, { status: currentImagesResponse.status });
    }

    let uploaded = false;
    let uploadedImage: any = null;
    if (!Array.isArray(currentImages?.results) || currentImages.results.length === 0) {
      const png = makeTestPng();
      const form = new FormData();
      form.set("image", new Blob([png], { type: "image/png" }), "chatgpt-direct-etsy-test.png");
      form.set("rank", "1");

      const uploadResponse = await fetch(
        `https://api.etsy.com/v3/application/shops/${shopId}/listings/${listingId}/images`,
        { method: "POST", headers, body: form, cache: "no-store" }
      );
      uploadedImage = await json(uploadResponse);
      if (!uploadResponse.ok) {
        return NextResponse.json({
          error: "image_upload_failed",
          listingId,
          created,
          details: uploadedImage,
        }, { status: uploadResponse.status });
      }
      uploaded = true;
    }

    const [verifyListingResponse, verifyImagesResponse] = await Promise.all([
      fetch(`https://api.etsy.com/v3/application/listings/${listingId}`, { headers, cache: "no-store" }),
      fetch(`https://api.etsy.com/v3/application/listings/${listingId}/images`, { headers, cache: "no-store" }),
    ]);
    const verifiedListing = await json(verifyListingResponse);
    const verifiedImages = await json(verifyImagesResponse);

    return NextResponse.json({
      ok: verifyListingResponse.ok && verifyImagesResponse.ok,
      created,
      uploaded,
      listingId,
      title: verifiedListing?.title ?? listing?.title ?? TEST_TITLE,
      state: verifiedListing?.state ?? listing?.state ?? null,
      price: verifiedListing?.price ?? listing?.price ?? null,
      imageCount: Array.isArray(verifiedImages?.results) ? verifiedImages.results.length : 0,
      imageId: uploadedImage?.listing_image_id ?? null,
      published: verifiedListing?.state === "active",
    });
  } catch (error) {
    console.error("Direct ChatGPT Etsy test failed", error);
    return NextResponse.json({ error: "direct_test_failed" }, { status: 502 });
  }
}
