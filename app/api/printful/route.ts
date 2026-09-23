import { NextRequest, NextResponse } from "next/server";
import { verifyArtistSession } from "../../../lib/museum-artist-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Read-only Printful integration. This route never creates products, orders, or charges.
const API = "https://api.printful.com";
const noStore = { "Cache-Control": "private, no-store, max-age=0" };
type Json = Record<string, unknown>;
class PrintfulError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}
function positiveId(value: unknown) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 && id <= 2147483647 ? id : null;
}
function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).host === request.nextUrl.host; } catch { return false; }
}
function configured() { return Boolean(process.env.PRINTFUL_PRIVATE_TOKEN?.trim()); }
function guard(request: NextRequest) {
  if (!verifyArtistSession(request)) return NextResponse.json({ error: "artist_session_required" }, { status: 401, headers: noStore });
  if (!configured()) return NextResponse.json({ error: "printful_token_missing" }, { status: 503, headers: noStore });
  return null;
}
async function printful(path: string, body?: Json, selectedStoreId?: number): Promise<unknown> {
  const token = process.env.PRINTFUL_PRIVATE_TOKEN?.trim();
  if (!token) throw new PrintfulError(503, "printful_token_missing");
  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, "X-PF-Language": "en_US" };
  const storeId = selectedStoreId ? String(selectedStoreId) : process.env.PRINTFUL_STORE_ID?.trim();
  if (storeId) headers["X-PF-Store-Id"] = storeId;
  if (body) headers["Content-Type"] = "application/json";
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      method: body ? "POST" : "GET", headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: "no-store", signal: AbortSignal.timeout(12_000),
    });
  } catch { throw new PrintfulError(502, "printful_unavailable"); }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new PrintfulError(502, "printful_token_invalid_or_insufficient_scope");
    if (response.status === 429) throw new PrintfulError(503, "printful_rate_limited");
    if (path === "/shipping/rates" && response.status === 400) throw new PrintfulError(422, "printful_shipping_rejected");
    if (path === "/shipping/rates" && response.status === 404) throw new PrintfulError(422, "printful_shipping_variant_unavailable");
    if (response.status === 404) throw new PrintfulError(404, "printful_product_not_found");
    // Do not forward arbitrary upstream error bodies (or credentials).
    throw new PrintfulError(502, "printful_request_failed");
  }
  let payload: { result?: unknown };
  try { payload = await response.json(); } catch { throw new PrintfulError(502, "printful_invalid_response"); }
  return payload.result;
}
function fail(error: unknown) {
  const status = error instanceof PrintfulError ? error.status : 502;
  const code = error instanceof PrintfulError ? error.code : "printful_request_failed";
  return NextResponse.json({ error: code }, { status, headers: noStore });
}
function numberString(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n.toFixed(2) : null;
}
type CatalogProduct = { id?: unknown; title?: unknown; type_name?: unknown; image?: unknown; currency?: unknown };
type Variant = { id?: unknown; name?: unknown; size?: unknown; price?: unknown; currency?: unknown; image?: unknown; product_id?: unknown };

export async function GET(request: NextRequest) {
  const denied = guard(request);
  if (denied) return denied;
  const action = request.nextUrl.searchParams.get("action") || "status";
  try {
    if (action === "status") {
      // Verify the token instead of claiming a connection merely because env exists.
      const stores = await printful("/stores");
      return NextResponse.json({
        connected: true,
        stores: Array.isArray(stores) ? stores.map((store: Json) => ({ id: store.id, name: store.name, type: store.type })) : [],
      }, { headers: noStore });
    }
    if (action === "catalog") {
      const query = (request.nextUrl.searchParams.get("q") || "").trim().toLowerCase().slice(0, 80);
      const products = await printful("/products");
      const list = Array.isArray(products) ? products as CatalogProduct[] : [];
      const matching = list.filter((p) => {
        const label = `${p.title || ""} ${p.type_name || ""}`.toLowerCase();
        return !query || label.includes(query);
      }).slice(0, 100).map((p) => ({
        id: p.id, title: p.title, type: p.type_name, image: p.image,
      }));
      return NextResponse.json({ products: matching }, { headers: noStore });
    }
    if (action === "product") {
      const id = positiveId(request.nextUrl.searchParams.get("id"));
      if (!id) return NextResponse.json({ error: "invalid_product_id" }, { status: 400, headers: noStore });
      const detail = await printful(`/products/${id}`) as { product?: CatalogProduct; variants?: Variant[] };
      if (!detail || !Array.isArray(detail.variants)) throw new PrintfulError(502, "printful_invalid_response");
      return NextResponse.json({
        product: { id: detail.product?.id, title: detail.product?.title, type: detail.product?.type_name, image: detail.product?.image },
        variants: detail.variants.map((variant) => ({
          id: variant.id, name: variant.name, size: variant.size, price: numberString(variant.price),
          currency: variant.currency || detail.product?.currency || "USD", image: variant.image,
        })),
        note: "Catalog prices exclude shipping, applicable tax, optional print placements and other adjustments. Confirm a final quote before setting retail pricing.",
      }, { headers: noStore });
    }
    return NextResponse.json({ error: "invalid_action" }, { status: 400, headers: noStore });
  } catch (error) { return fail(error); }
}

export async function POST(request: NextRequest) {
  const denied = guard(request);
  if (denied) return denied;
  if (!sameOrigin(request)) return NextResponse.json({ error: "cross_origin_request" }, { status: 403, headers: noStore });
  const data = await request.json().catch(() => null);
  const variantId = positiveId(data?.variantId);
  const storeId = positiveId(data?.storeId);
  const quantity = Number(data?.quantity ?? 1);
  const countryCode = String(data?.countryCode || "").toUpperCase();
  const stateCode = String(data?.stateCode || "").toUpperCase();
  const zip = String(data?.zip || "").trim();
  if (!storeId) return NextResponse.json({ error: "printful_store_selection_required" }, { status: 400, headers: noStore });
  if (!variantId || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 20 ||
      !/^[A-Z]{2}$/.test(countryCode) || (["US", "CA", "AU"].includes(countryCode) && !/^[A-Z0-9-]{2,5}$/.test(stateCode)) ||
      zip.length > 16 || (zip && !/^[A-Z0-9 -]+$/i.test(zip))) {
    return NextResponse.json({ error: "invalid_shipping_input" }, { status: 400, headers: noStore });
  }
  try {
    // Account-scoped tokens can see several stores. Only quote for a store
    // returned to this token; never silently use another brand or env default.
    const accessible = await printful("/stores");
    if (!Array.isArray(accessible)) throw new PrintfulError(502, "printful_invalid_stores_response");
    if (!accessible.some((store: Json) => positiveId(store.id) === storeId)) {
      throw new PrintfulError(403, "printful_store_not_accessible");
    }
    const recipient: Json = { country_code: countryCode };
    if (stateCode) recipient.state_code = stateCode;
    if (zip) recipient.zip = zip;
    const rates = await printful("/shipping/rates", {
      recipient, items: [{ variant_id: variantId, quantity }], currency: "USD",
    }, storeId);
    if (!Array.isArray(rates)) throw new PrintfulError(502, "printful_invalid_response");
    return NextResponse.json({
      rates: rates.map((rate: Json) => ({
        id: rate.id, name: rate.name, rate: numberString(rate.rate), currency: rate.currency || "USD",
      })).filter((rate) => rate.rate !== null),
      quotedAt: new Date().toISOString(),
      storeId,
      note: "Live shipping estimates are not locked; Printful may charge a different final amount. Taxes and additional product options are not included.",
    }, { headers: noStore });
  } catch (error) { return fail(error); }
}
