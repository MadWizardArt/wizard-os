import { createDecipheriv, createCipheriv, createHash, randomBytes } from "node:crypto";
import { readFileSync, mkdirSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import pg from "pg";

if (process.env.VERCEL_ENV !== "production") {
  console.log("Skipping Volans Etsy release outside production.");
  process.exit(0);
}

const { Pool } = pg;
const TITLE = "VOLANS AETHEREUS — The Sky Wanderer | Medieval Manuscript Barn Owl Art Print";
const STORE_ID = 12562279;
const VARIANTS = [
  { dbId: "spellmarkowlunframed8x10v1", label: "8×10 unframed", price: 24.00, sku: "SM-OWL-P1-V4463" },
  { dbId: "spellmarkowlunframedv1", label: "11×14 unframed", price: 28.00, sku: "SM-OWL-P1-V14125" },
  { dbId: "spellmarkowlframedv1", label: "11×14 black framed", price: 69.00, sku: "SM-OWL-P2-V14292" },
];

function env(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}
function cryptoKey() { return createHash("sha256").update(env("ETSY_SESSION_SECRET")).digest(); }
function decryptSession(value) {
  const [iv, tag, data] = value.split(".");
  const d = createDecipheriv("aes-256-gcm", cryptoKey(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(data, "base64url")), d.final()]).toString("utf8"));
}
function encryptSession(payload) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", cryptoKey(), iv);
  const enc = Buffer.concat([c.update(Buffer.from(JSON.stringify(payload))), c.final()]);
  return `${iv.toString("base64url")}.${c.getAuthTag().toString("base64url")}.${enc.toString("base64url")}`;
}
function eh(token) {
  return {
    "x-api-key": `${env("ETSY_API_KEYSTRING")}:${env("ETSY_SHARED_SECRET")}`,
    Authorization: `Bearer ${token}`,
  };
}
async function asJson(r) {
  const p = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${JSON.stringify(p)}`);
  return p;
}
async function refreshIfNeeded(pool, session) {
  if (+session.expires_at > Date.now() + 300000) return session;
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: env("ETSY_API_KEYSTRING"),
    refresh_token: session.refresh_token,
  });
  const token = await asJson(await fetch("https://api.etsy.com/v3/public/oauth/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body,
  }));
  const next = { access_token: token.access_token, refresh_token: token.refresh_token, expires_at: Date.now() + token.expires_in * 1000 };
  await pool.query('UPDATE "EtsyConnection" SET "encryptedSession"=$1,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$2', [encryptSession(next), "primary"]);
  return next;
}
function flatten(nodes, path = []) {
  const out = [];
  for (const n of nodes || []) {
    const p = [...path, n.name || ""];
    out.push({ id: Number(n.id), name: n.name || "", path: p.join(" > "), children: n.children || [] });
    out.push(...flatten(n.children || [], p));
  }
  return out;
}
function chooseShipping(list) {
  if (!list.length) throw new Error("No Etsy shipping profiles available");
  const scored = list.map(p => {
    const s = String(p.title || "").toLowerCase();
    let score = 0;
    if (/printful/.test(s)) score += 100;
    if (/poster|print|art/.test(s)) score += 30;
    if (/standard|physical/.test(s)) score += 10;
    return { p, score };
  }).sort((a,b)=>b.score-a.score);
  return scored[0].p;
}
function chooseReadiness(list) {
  if (!list.length) throw new Error("No Etsy processing profiles available");
  return [...list].sort((a,b) =>
    Number(a.max_processing_time ?? 99) - Number(b.max_processing_time ?? 99) ||
    Number(a.min_processing_time ?? 99) - Number(b.min_processing_time ?? 99)
  )[0];
}

const pool = new Pool({ connectionString: env("DATABASE_URL"), max: 1 });
try {
  const saved = await pool.query('SELECT "encryptedSession" FROM "EtsyConnection" WHERE "id"=$1 LIMIT 1', ["primary"]);
  if (!saved.rows[0]?.encryptedSession) throw new Error("No persisted Etsy OAuth grant");
  let session = decryptSession(saved.rows[0].encryptedSession);
  session = await refreshIfNeeded(pool, session);
  const userId = String(session.access_token).split(".")[0];
  if (!/^\d+$/.test(userId)) throw new Error("Invalid Etsy access token");

  const shop = await asJson(await fetch(`https://api.etsy.com/v3/application/users/${userId}/shops`, { headers: eh(session.access_token) }));
  const shopId = Number(shop?.shop_id);
  if (!shopId || shopId !== Number(env("WARLOCK_SHOP_ID"))) throw new Error("etsy_shop_not_allowed");

  const [draftsPayload, shippingPayload, readinessPayload, taxonomyPayload] = await Promise.all([
    asJson(await fetch(`https://api.etsy.com/v3/application/shops/${shopId}/listings?state=draft&limit=100`, { headers: eh(session.access_token) })),
    asJson(await fetch(`https://api.etsy.com/v3/application/shops/${shopId}/shipping-profiles`, { headers: eh(session.access_token) })),
    asJson(await fetch(`https://api.etsy.com/v3/application/shops/${shopId}/readiness-state-definitions`, { headers: eh(session.access_token) })),
    asJson(await fetch("https://api.etsy.com/v3/application/seller-taxonomy/nodes", { headers: eh(session.access_token) })),
  ]);

  const shipping = chooseShipping(shippingPayload.results || []);
  const readiness = chooseReadiness(readinessPayload.results || []);
  const tax = flatten(taxonomyPayload.results || []);
  const taxonomy =
    tax.find(n => /art & collectibles/i.test(n.path) && /^prints$/i.test(n.name)) ||
    tax.find(n => /art & collectibles/i.test(n.path) && /print/i.test(n.name)) ||
    tax.find(n => /wall decor/i.test(n.path));
  if (!taxonomy?.id) throw new Error("Could not resolve Etsy print taxonomy");

  const drafts = draftsPayload.results || [];
  let listing = drafts.find(x => String(x.title || "").startsWith("VOLANS AETHEREUS — The Sky Wanderer"));
  let created = false;

  if (!listing) {
    const description = [
      "VOLANS AETHEREUS — The Sky Wanderer is the flagship owl of Spellmark’s Cabinet of Curiosities collection.",
      "",
      "A naturalistic barn owl appears within a restrained illuminated-manuscript-inspired folio: parchment texture, celestial ornament, botanical flourishes, and gold-toned printed details. The gold appearance is part of the printed artwork; it is not metallic foil or hand gilding.",
      "",
      "Choose your edition:",
      "• 8×10 in unframed Enhanced Matte Paper Poster — $24",
      "• 11×14 in unframed Enhanced Matte Paper Poster — $28",
      "• 11×14 in Enhanced Matte Paper Framed Poster with BLACK frame — $69",
      "",
      "Unframed editions do not include a frame. The framed edition includes the black frame shown in the product imagery. Decorative props are not included.",
      "",
      "Printed on demand through Printful. Artwork and listing presentation approved September 25, 2026.",
    ].join("\n");

    const body = new URLSearchParams({
      quantity: "999", title: TITLE, description, price: "24.00",
      who_made: "i_did", when_made: "2020_2026",
      taxonomy_id: String(taxonomy.id), is_supply: "false",
      should_auto_renew: "true", type: "physical",
      shipping_profile_id: String(shipping.shipping_profile_id),
      readiness_state_id: String(readiness.readiness_state_id),
      tags: ["barn owl print","medieval wall art","celestial owl","manuscript art","dark academia decor","owl wall decor","nature illustration","gothic wall art","illuminated art","mystical owl","curiosity cabinet","black framed print","Spellmark"].join(","),
    });
    listing = await asJson(await fetch(`https://api.etsy.com/v3/application/shops/${shopId}/listings?legacy=false`, {
      method: "POST",
      headers: { ...eh(session.access_token), "Content-Type": "application/x-www-form-urlencoded; charset=utf-8" },
      body,
    }));
    created = true;
  }

  const listingId = Number(listing.listing_id);
  if (!listingId) throw new Error("Missing Etsy listing ID");

  const inventoryBody = {
    products: VARIANTS.map(v => ({
      sku: v.sku,
      offerings: [{ quantity: 999, price: v.price, is_enabled: true, readiness_state_id: Number(readiness.readiness_state_id) }],
      property_values: [{ property_id: 513, property_name: "Edition", scale_id: null, value_ids: [], values: [v.label] }],
    })),
    price_on_property: [513],
    quantity_on_property: [],
    sku_on_property: [513],
    readiness_state_on_property: [],
  };
  const inventory = await asJson(await fetch(`https://api.etsy.com/v3/application/listings/${listingId}/inventory?legacy=false`, {
    method: "PUT",
    headers: { ...eh(session.access_token), "Content-Type": "application/json" },
    body: JSON.stringify(inventoryBody),
  }));

  // Decode the conversation-approved listing images staged only for this release.
  mkdirSync("/tmp/volans-images", { recursive: true });
  const b64 = readFileSync("tmp/volans_upload_compact2.b64", "utf8").trim();
  const zipPath = "/tmp/volans-images.zip";
  await import("node:fs").then(fs => fs.writeFileSync(zipPath, Buffer.from(b64, "base64")));
  const unzip = spawnSync("unzip", ["-o", "-q", zipPath, "-d", "/tmp/volans-images"], { stdio: "inherit" });
  if (unzip.status !== 0) throw new Error("Could not unpack approved Etsy images");
  const images = readdirSync("/tmp/volans-images").filter(f => /\.jpe?g$/i.test(f)).sort();
  if (images.length !== 10) throw new Error(`Expected 10 approved images, found ${images.length}`);

  const existingImages = await asJson(await fetch(`https://api.etsy.com/v3/application/listings/${listingId}/images`, { headers: eh(session.access_token) }));
  const existingCount = Array.isArray(existingImages.results) ? existingImages.results.length : 0;
  for (let i = existingCount; i < images.length; i++) {
    const filename = images[i];
    const form = new FormData();
    form.set("image", new Blob([readFileSync(`/tmp/volans-images/${filename}`)], { type: "image/jpeg" }), filename);
    form.set("rank", String(i + 1));
    await asJson(await fetch(`https://api.etsy.com/v3/application/shops/${shopId}/listings/${listingId}/images`, {
      method: "POST", headers: eh(session.access_token), body: form,
    }));
  }

  await pool.query(
    'UPDATE "SpellmarkVariant" SET "etsyListingId"=$1,"updatedAt"=CURRENT_TIMESTAMP WHERE "id" = ANY($2::text[])',
    [String(listingId), VARIANTS.map(v => v.dbId)]
  );

  const [verifiedListing, verifiedInventory, verifiedImages] = await Promise.all([
    asJson(await fetch(`https://api.etsy.com/v3/application/listings/${listingId}`, { headers: eh(session.access_token) })),
    asJson(await fetch(`https://api.etsy.com/v3/application/listings/${listingId}/inventory`, { headers: eh(session.access_token) })),
    asJson(await fetch(`https://api.etsy.com/v3/application/listings/${listingId}/images`, { headers: eh(session.access_token) })),
  ]);
  const imageCount = Array.isArray(verifiedImages.results) ? verifiedImages.results.length : 0;
  const products = Array.isArray(verifiedInventory.products) ? verifiedInventory.products : [];
  const prices = products.map(p => p.offerings?.[0]?.price?.amount != null
    ? Number(p.offerings[0].price.amount) / Number(p.offerings[0].price.divisor || 100)
    : Number(p.offerings?.[0]?.price)).filter(Number.isFinite);

  const result = {
    ok: verifiedListing.state === "draft" && imageCount === 10 && products.length === 3,
    listingId,
    title: verifiedListing.title,
    state: verifiedListing.state,
    created,
    imageCount,
    variantCount: products.length,
    prices,
    taxonomy: { id: taxonomy.id, path: taxonomy.path },
    shippingProfile: { id: shipping.shipping_profile_id, title: shipping.title || null },
    readinessProfile: { id: readiness.readiness_state_id, label: readiness.readiness_state || null, min: readiness.min_processing_time, max: readiness.max_processing_time },
    printful: { storeId: STORE_ID, catalogVariants: [4463,14125,14292] },
    published: verifiedListing.state === "active",
  };
  console.log("VOLANS_ETSY_RELEASE_RESULT", JSON.stringify(result));
  if (!result.ok || result.published) throw new Error(`Volans verification failed: ${JSON.stringify(result)}`);
} finally {
  await pool.end();
}
