import * as z from "zod/v4";
import { createHash } from "node:crypto";
import { etsyListingType } from "./etsy-listing-type.ts";
export type Json = Record<string, unknown>;
export type ShippingRead = (path: string) => Promise<Json>;
const remoteId = z.string().regex(/^[1-9]\d{0,18}$/);
export const shippingPreviewShape = {
  productId: z.string().min(1).max(100), sourceProfileId: remoteId,
  targetProfileId: remoteId.optional(), title: z.string().trim().min(1).max(100).optional(),
};
export const shippingApplyShape = {
  productId: z.string().min(1).max(100), previewId: z.string().min(1).max(100), confirmShippingChange: z.literal(true),
};
export const shippingPreviewSchema = z.strictObject(shippingPreviewShape);
export const shippingApplySchema = z.strictObject(shippingApplyShape);
export function object(v: unknown): Json {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw Error("etsy_shipping_response_invalid");
  return v as Json;
}
export function fingerprint(v: unknown): string {
  const canonical = (x: unknown): unknown => Array.isArray(x) ? x.map(canonical) : x && typeof x === "object" ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)])) : x;
  return createHash("sha256").update(JSON.stringify(canonical(v))).digest("hex");
}
export function id(v: unknown): string {
  // Reject already-rounded unsafe JSON numbers.
  if (typeof v === "number" && !Number.isSafeInteger(v)) throw Error("etsy_shipping_id_invalid");
  return remoteId.parse(String(v));
}
function money(v: unknown) {
  const m = object(v);
  if (!Number.isSafeInteger(m.amount) || Number(m.amount) < 0 || !Number.isSafeInteger(m.divisor) || Number(m.divisor) <= 0 || typeof m.currency_code !== "string" || !/^[A-Z]{3}$/.test(m.currency_code)) throw Error("etsy_shipping_rate_unverified");
  return { amount: Number(m.amount), divisor: Number(m.divisor), currency: m.currency_code };
}
export function domesticProfile(p: Json, profileId: string, usOnly = false) {
  if (id(p.shipping_profile_id) !== profileId || p.is_deleted !== false || p.profile_type !== "manual") throw Error("etsy_shipping_profile_unsupported");
  if (!Array.isArray(p.shipping_profile_destinations) || !Array.isArray(p.shipping_profile_upgrades)) throw Error("etsy_shipping_destinations_missing");
  // Do not silently remove a paid upgrade or carry an international upgrade forward.
  if (p.shipping_profile_upgrades.length) throw Error("etsy_shipping_upgrades_require_manual_review");
  const ds = p.shipping_profile_destinations.map(object);
  const us = ds.filter(d => d.destination_country_iso === "US" && (d.destination_region == null || d.destination_region === "none"));
  if (us.length !== 1 || (usOnly && ds.length !== 1)) throw Error("etsy_shipping_us_destination_unverified");
  const d = us[0], primary = money(d.primary_cost), secondary = money(d.secondary_cost);
  if (primary.currency !== secondary.currency) throw Error("etsy_shipping_currency_mismatch");
  if (typeof p.origin_country_iso !== "string" || !/^[A-Z]{2}$/.test(p.origin_country_iso) || typeof p.origin_postal_code !== "string" || !p.origin_postal_code.trim()) throw Error("etsy_shipping_origin_unverified");
  const service = { shipping_carrier_id: d.shipping_carrier_id ?? null, mail_class: d.mail_class ?? null, min_delivery_days: d.min_delivery_days ?? null, max_delivery_days: d.max_delivery_days ?? null };
  const carrierValid = Number.isSafeInteger(service.shipping_carrier_id) && Number(service.shipping_carrier_id) > 0 && typeof service.mail_class === "string" && !!service.mail_class;
  const daysValid = Number.isInteger(service.min_delivery_days) && Number(service.min_delivery_days) >= 1 && Number(service.max_delivery_days) >= Number(service.min_delivery_days) && Number.isInteger(service.max_delivery_days) && Number(service.max_delivery_days) <= 45;
  if (!carrierValid && !daysValid) throw Error("etsy_shipping_delivery_unverified");
  return { originCountry: p.origin_country_iso, originPostalCode: p.origin_postal_code, primary, secondary, service, usOnly: ds.length === 1 };
}
export function compatible(a: ReturnType<typeof domesticProfile>, b: ReturnType<typeof domesticProfile>) {
  const { usOnly: _a, ...left } = a, { usOnly: _b, ...right } = b;
  return fingerprint(left) === fingerprint(right);
}
export function profileCreateBody(p: Json, sourceId: string, title: string, currency: string) {
  const d = domesticProfile(p, sourceId);
  if (d.primary.currency !== currency) throw Error("etsy_shipping_shop_currency_changed");
  const decimal = (m: typeof d.primary) => {
    const n = m.amount / m.divisor;
    if (!Number.isFinite(n) || Math.abs(n * m.divisor - m.amount) > 0.000001) throw Error("etsy_shipping_rate_unverified");
    return String(n);
  };
  const body: Record<string, string> = { title, origin_country_iso: d.originCountry, origin_postal_code: d.originPostalCode, destination_country_iso: "US", primary_cost: decimal(d.primary), secondary_cost: decimal(d.secondary) };
  for (const [k, v] of Object.entries(d.service)) if (v !== null) body[k] = String(v);
  return body;
}
export function listingSnapshot(p: Json, listingId: string, shopId: number) {
  if (id(p.listing_id) !== listingId || id(p.shop_id) !== String(shopId)) throw Error("etsy_shipping_listing_ownership_mismatch");
  if (etsyListingType(p) !== "physical") throw Error("etsy_shipping_digital_listing_excluded");
  if (!["draft", "active"].includes(String(p.state))) throw Error("etsy_shipping_listing_state_unsupported");
  const stable = Object.fromEntries(Object.entries(p).filter(([k]) => !k.endsWith("_timestamp") && !["shipping_profile_id", "shipping_profile", "views", "num_favorers"].includes(k)));
  return { profileId: id(p.shipping_profile_id), otherFingerprint: fingerprint(stable) };
}
export async function auditShipping(shopId: number, read: ShippingRead) {
  const base = `/shops/${shopId}`, payload = await read(base + "/shipping-profiles");
  if (!Array.isArray(payload.results) || payload.results.length !== payload.count) throw Error("etsy_shipping_profile_audit_incomplete");
  const profiles = payload.results.map(object), listings: Json[] = [], seen = new Set<string>();
  for (const state of ["active", "draft", "inactive", "sold_out", "expired"]) {
    let complete = false;
    for (let offset = 0; offset < 10000; offset += 100) {
      const page = await read(`${base}/listings?state=${state}&limit=100&offset=${offset}`);
      if (!Array.isArray(page.results) || !Number.isSafeInteger(page.count) || Number(page.count) < 0) throw Error("etsy_shipping_listing_audit_incomplete");
      for (const value of page.results) {
        const l = object(value), lid = id(l.listing_id);
        if (id(l.shop_id) !== String(shopId) || seen.has(lid)) throw Error("etsy_shipping_listing_audit_changed");
        seen.add(lid);
        if (etsyListingType(l) === "physical") listings.push({ listingId: lid, title: l.title, state: l.state, profileId: l.shipping_profile_id == null ? null : id(l.shipping_profile_id) });
      }
      if (offset + page.results.length >= Number(page.count)) { complete = true; break; }
      if (page.results.length !== 100) throw Error("etsy_shipping_listing_audit_incomplete");
    }
    if (!complete) throw Error("etsy_shipping_listing_audit_incomplete");
  }
  return { state: "SHIPPING_AUDITED", checkedAt: new Date().toISOString(), shopId, profiles: profiles.map(p => {
    const profileId = id(p.shipping_profile_id);
    try { return { profileId, title: p.title, ...domesticProfile(p, profileId), listings: listings.filter(l => l.profileId === profileId) }; }
    catch (e) { return { profileId, title: p.title, blocker: safeShippingError(e), listings: listings.filter(l => l.profileId === profileId) }; }
  }), missingProfiles: listings.filter(l => !profiles.some(p => String(p.shipping_profile_id) === l.profileId)), digitalListingsExcluded: true };
}
export function safeShippingError(e: unknown) {
  const code = e instanceof Error ? e.message : "";
  return /^(etsy_shipping_[a-z_]+|etsy_http_\d{3}|warlock_commerce_writes_disabled|etsy_not_connected|etsy_shop_not_allowed|warlock_shop_id_missing)$/.test(code) ? code : "etsy_shipping_request_failed";
}
