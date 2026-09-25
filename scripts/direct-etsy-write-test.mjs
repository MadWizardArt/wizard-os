import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { deflateSync } from "node:zlib";
import pg from "pg";

if (process.env.VERCEL_ENV !== "production") {
  console.log("Skipping direct Etsy write test outside production.");
  process.exit(0);
}

const { Pool } = pg;
const TEST_TITLE = "TEST — ChatGPT Direct Etsy Draft — Do Not Publish";

function env(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function encryptionKey() {
  return createHash("sha256").update(env("ETSY_SESSION_SECRET")).digest();
}

function decryptSession(value) {
  const [ivPart, tagPart, dataPart] = value.split(".");
  if (!ivPart || !tagPart || !dataPart) throw new Error("Invalid Etsy session");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataPart, "base64url")),
    decipher.final(),
  ]);
  return JSON.parse(decrypted.toString("utf8"));
}

function encryptSession(payload) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

function headers(accessToken) {
  return {
    "x-api-key": `${env("ETSY_API_KEYSTRING")}:${env("ETSY_SHARED_SECRET")}`,
    Authorization: `Bearer ${accessToken}`,
  };
}

async function refreshIfNeeded(pool, session) {
  if (Number(session.expires_at) > Date.now() + 5 * 60 * 1000) return session;
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: env("ETSY_API_KEYSTRING"),
    refresh_token: session.refresh_token,
  });
  const response = await fetch("https://api.etsy.com/v3/public/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) throw new Error(`Etsy refresh failed ${response.status}: ${await response.text()}`);
  const token = await response.json();
  const refreshed = {
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expires_at: Date.now() + token.expires_in * 1000,
  };
  await pool.query(
    'UPDATE "EtsyConnection" SET "encryptedSession" = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $2',
    [encryptSession(refreshed), "primary"]
  );
  return refreshed;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

function makePng() {
  const width = 1200, height = 1200, stride = width * 3 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    raw[row] = 0;
    for (let x = 0; x < width; x++) {
      const i = row + 1 + x * 3;
      const border = x < 32 || x >= width - 32 || y < 32 || y >= height - 32;
      const inner = x > 185 && x < 1015 && y > 185 && y < 1015;
      const c = border ? [52, 39, 31] : inner ? [215, 198, 163] : [238, 228, 207];
      raw[i] = c[0]; raw[i + 1] = c[1]; raw[i + 2] = c[2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

const pool = new Pool({ connectionString: env("DATABASE_URL"), max: 1 });

try {
  const saved = await pool.query('SELECT "encryptedSession" FROM "EtsyConnection" WHERE "id" = $1 LIMIT 1', ["primary"]);
  if (!saved.rows[0]?.encryptedSession) throw new Error("No persisted Etsy connection");

  let session = decryptSession(saved.rows[0].encryptedSession);
  session = await refreshIfNeeded(pool, session);

  const userId = String(session.access_token).split(".")[0];
  if (!/^\d+$/.test(userId)) throw new Error("Invalid Etsy access token");

  const shopResponse = await fetch(`https://api.etsy.com/v3/application/users/${userId}/shops`, {
    headers: headers(session.access_token),
  });
  const shop = await shopResponse.json();
  if (!shopResponse.ok) throw new Error(`Shop lookup failed ${shopResponse.status}: ${JSON.stringify(shop)}`);

  const shopId = Number(shop?.shop_id);
  const allowedShopId = Number(env("WARLOCK_SHOP_ID"));
  if (!shopId || shopId !== allowedShopId) throw new Error("etsy_shop_not_allowed");

  const draftResponse = await fetch(
    `https://api.etsy.com/v3/application/shops/${shopId}/listings?state=draft&limit=100`,
    { headers: headers(session.access_token) }
  );
  const draftPayload = await draftResponse.json();
  if (!draftResponse.ok) throw new Error(`Draft lookup failed ${draftResponse.status}: ${JSON.stringify(draftPayload)}`);

  const drafts = Array.isArray(draftPayload?.results) ? draftPayload.results : [];
  let listing = drafts.find((item) => item?.title === TEST_TITLE);
  let created = false;

  if (!listing) {
    const taxonomyId = Number(drafts.find((item) => Number(item?.taxonomy_id) > 0)?.taxonomy_id);
    if (!taxonomyId) throw new Error("No draft taxonomy available to seed safe test listing");

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

    const createResponse = await fetch(`https://api.etsy.com/v3/application/shops/${shopId}/listings`, {
      method: "POST",
      headers: {
        ...headers(session.access_token),
        "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
      },
      body,
    });
    listing = await createResponse.json();
    if (!createResponse.ok) throw new Error(`Draft create failed ${createResponse.status}: ${JSON.stringify(listing)}`);
    created = true;
  }

  const listingId = Number(listing?.listing_id);
  if (!listingId) throw new Error("Test listing ID missing");

  let imagesResponse = await fetch(`https://api.etsy.com/v3/application/listings/${listingId}/images`, {
    headers: headers(session.access_token),
  });
  let images = await imagesResponse.json();
  if (!imagesResponse.ok) throw new Error(`Image lookup failed ${imagesResponse.status}: ${JSON.stringify(images)}`);

  let uploaded = false;
  if (!Array.isArray(images?.results) || images.results.length === 0) {
    const png = makePng();
    const form = new FormData();
    form.set("image", new Blob([png], { type: "image/png" }), "chatgpt-direct-etsy-test.png");
    form.set("rank", "1");

    const uploadResponse = await fetch(
      `https://api.etsy.com/v3/application/shops/${shopId}/listings/${listingId}/images`,
      { method: "POST", headers: headers(session.access_token), body: form }
    );
    const uploadPayload = await uploadResponse.json();
    if (!uploadResponse.ok) throw new Error(`Image upload failed ${uploadResponse.status}: ${JSON.stringify(uploadPayload)}`);
    uploaded = true;
  }

  const [verifyListingResponse, verifyImagesResponse] = await Promise.all([
    fetch(`https://api.etsy.com/v3/application/listings/${listingId}`, { headers: headers(session.access_token) }),
    fetch(`https://api.etsy.com/v3/application/listings/${listingId}/images`, { headers: headers(session.access_token) }),
  ]);
  const verifiedListing = await verifyListingResponse.json();
  const verifiedImages = await verifyImagesResponse.json();
  if (!verifyListingResponse.ok || !verifyImagesResponse.ok) throw new Error("Verification request failed");

  const result = {
    ok: true,
    listingId,
    title: verifiedListing?.title,
    state: verifiedListing?.state,
    imageCount: Array.isArray(verifiedImages?.results) ? verifiedImages.results.length : 0,
    created,
    uploaded,
    published: verifiedListing?.state === "active",
  };
  console.log("DIRECT_ETSY_TEST_RESULT", JSON.stringify(result));
  if (result.published || result.state !== "draft" || result.imageCount < 1) {
    throw new Error(`Unsafe or incomplete test result: ${JSON.stringify(result)}`);
  }
} finally {
  await pool.end();
}
