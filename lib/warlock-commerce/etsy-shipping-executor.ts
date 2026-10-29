import { randomUUID } from "node:crypto";
import { prisma } from "../prisma";
import { etsyHeaders } from "../etsy-client";
import { getWarlockEtsyOperatorContext } from "../warlock-auth";
import { findWarlockProduct } from "../warlock-mcp/repository";
import { canonicalBookkeepingFingerprint } from "./listing-observation.ts";
import { assertCommerceDraftWritesEnabled } from "./write-guard.ts";
import { auditShipping, shippingPreviewSchema, shippingApplySchema, domesticProfile, compatible, profileCreateBody, listingSnapshot, fingerprint, object, id, safeShippingError, type Json } from "./etsy-shipping.ts";
async function context() {
  const { auth, shopId, shop } = await getWarlockEtsyOperatorContext();
  const request = async (path: string, method = "GET", fields?: Record<string, string>) => {
    const response = await fetch("https://api.etsy.com/v3/application" + path, {
      method, headers: { ...etsyHeaders(auth.session.access_token), ...(fields ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
      body: fields ? new URLSearchParams(fields) : undefined, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw Error("etsy_http_" + response.status);
    return object(await response.json());
  };
  const currency = String(shop.currency_code ?? "");
  return { shopId, currency, request, profile: (profileId: string) => request(`/shops/${shopId}/shipping-profiles/${profileId}`) };
}
export async function inspectEtsyShippingProfiles() {
  const ctx = await context();
  return auditShipping(ctx.shopId, ctx.request);
}
function physical(product: NonNullable<Awaited<ReturnType<typeof findWarlockProduct>>>) {
  const listing = product.listings.filter(l => l.fulfillment === "PHYSICAL");
  if (listing.length !== 1) throw Error("etsy_shipping_physical_listing_missing");
  return listing[0];
}
export async function previewEtsyShippingChange(raw: unknown) {
  const input = shippingPreviewSchema.parse(raw), product = await findWarlockProduct({ productId: input.productId });
  if (!product) throw Error("etsy_shipping_product_missing");
  const listing = physical(product), ctx = await context(), source = await ctx.profile(input.sourceProfileId);
  const domestic = domesticProfile(source, input.sourceProfileId);
  if (domestic.primary.currency !== ctx.currency) throw Error("etsy_shipping_shop_currency_changed");
  const remote = listing.etsyListingId ? listingSnapshot(await ctx.request("/listings/" + listing.etsyListingId), listing.etsyListingId, ctx.shopId) : null;
  // Existing listings must retain their own verified rates, not another product's assumed rates.
  if (remote && remote.profileId !== input.sourceProfileId) throw Error("etsy_shipping_source_not_current_profile");
  let target: Json | null = null;
  if (input.targetProfileId) {
    target = await ctx.profile(input.targetProfileId);
    if (!compatible(domestic, domesticProfile(target, input.targetProfileId, true))) throw Error("etsy_shipping_target_rates_or_service_differ");
  }
  const title = input.title ?? String(source.title ?? "Shipping").slice(0, 85) + " — US only";
  const createBody = target ? null : profileCreateBody(source, input.sourceProfileId, title, ctx.currency);
  if (!target && domestic.usOnly) throw Error("etsy_shipping_reuse_existing_us_profile");
  const preview = { version: 1, input, shopId: ctx.shopId, currency: ctx.currency, listingId: listing.id, etsyListingId: listing.etsyListingId ?? null,
    canonicalFingerprint: canonicalBookkeepingFingerprint(product), source, target, remote, domestic, createBody,
    expiresAt: new Date(Date.now() + 600000).toISOString() };
  const saved = await prisma.spellmarkJournal.create({ data: { productId: product.id, requestId: randomUUID(), kind: "ETSY_SHIPPING_PREVIEW", bodyJson: JSON.stringify(preview) } });
  return { state: "PREVIEW_READY", previewId: saved.id, preview, affectedListings: [{ productId: product.id, listingId: listing.id, etsyListingId: listing.etsyListingId ?? null, title: listing.title }],
    nextAction: "Show the owner the source and replacement profiles, unchanged first/additional item costs, delivery service, US-only destinations and affected listing. Apply this exact preview only after approval. Source profiles are never modified. For a future listing, this saves the verified profile for the existing draft workflow." };
}
type Preview = Awaited<ReturnType<typeof previewEtsyShippingChange>>['preview'];
export async function applyEtsyShippingChange(raw: unknown) {
  const input = shippingApplySchema.parse(raw); assertCommerceDraftWritesEnabled();
  const saved = await prisma.spellmarkJournal.findFirst({ where: { id: input.previewId, productId: input.productId, kind: "ETSY_SHIPPING_PREVIEW" } });
  if (!saved) throw Error("etsy_shipping_preview_missing");
  const p = JSON.parse(saved.bodyJson) as Preview, ctx = await context();
  if (p.version !== 1 || p.input.productId !== input.productId || p.shopId !== ctx.shopId || p.currency !== ctx.currency) throw Error("etsy_shipping_preview_identity_changed");
  const key = { productId: input.productId, requestId: "etsy-shipping:" + saved.id };
  let event = await prisma.spellmarkJournal.findUnique({ where: { productId_requestId: key } });
  if (!event) {
    if (!Number.isFinite(Date.parse(p.expiresAt)) || Date.now() >= Date.parse(p.expiresAt)) throw Error("etsy_shipping_preview_expired");
    // Unique key makes concurrent applications converge on one durable operation.
    event = await prisma.spellmarkJournal.upsert({ where: { productId_requestId: key }, create: { ...key, kind: "ETSY_SHIPPING_CHANGE", bodyJson: JSON.stringify({ state: "READY", approvedPreview: p, targetProfileId: p.input.targetProfileId ?? null }) }, update: {} });
  }
  const previous = JSON.parse(event.bodyJson) as Json;
  if (previous.state === "SHIPPING_VERIFIED") return { ...previous, historical: true, reused: true };
  let targetProfileId = previous.targetProfileId ? id(previous.targetProfileId) : null;
  const claimed = previous.state === "READY"
    ? await prisma.spellmarkJournal.updateMany({ where: { id: event.id, bodyJson: event.bodyJson }, data: { bodyJson: JSON.stringify({ ...previous, state: "SENDING" }) } })
    : { count: 0 };
  const canWrite = claimed.count === 1;
  try {
    return await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${"warlock-product-prices:" + input.productId}))::text`;
      const product = await findWarlockProduct({ productId: input.productId }, tx);
      if (!product) throw Error("etsy_shipping_product_missing");
      const listing = physical(product);
      if (listing.id !== p.listingId || (listing.etsyListingId ?? null) !== p.etsyListingId || canonicalBookkeepingFingerprint(product) !== p.canonicalFingerprint) throw Error("etsy_shipping_canonical_changed");
      if (canWrite && Date.now() >= Date.parse(p.expiresAt)) throw Error("etsy_shipping_preview_expired");
      const source = await ctx.profile(p.input.sourceProfileId);
      if (fingerprint(source) !== fingerprint(p.source)) throw Error("etsy_shipping_source_changed");
      const checkTarget = async (targetId: string) => {
        const target = await ctx.profile(targetId);
        if (!compatible(domesticProfile(source, p.input.sourceProfileId), domesticProfile(target, targetId, true))) throw Error("etsy_shipping_target_verification_failed");
        if (p.target && fingerprint(target) !== fingerprint(p.target)) throw Error("etsy_shipping_target_changed");
        return target;
      };
      const before = p.etsyListingId ? listingSnapshot(await ctx.request("/listings/" + p.etsyListingId), p.etsyListingId, ctx.shopId) : null;
      if (before && (before.otherFingerprint !== p.remote?.otherFingerprint || (before.profileId !== p.remote?.profileId && before.profileId !== targetProfileId))) throw Error("etsy_shipping_listing_changed");
      if (!targetProfileId) {
        if (!canWrite || !p.createBody) throw Error("etsy_shipping_unknown_creation_outcome_review_required");
        const created = await ctx.request(`/shops/${ctx.shopId}/shipping-profiles`, "POST", p.createBody);
        targetProfileId = id(created.shipping_profile_id);
        // Commit the remote ID immediately, outside the transaction. Unknown POST outcomes are never replayed.
        await prisma.spellmarkJournal.update({ where: { id: event!.id }, data: { bodyJson: JSON.stringify({ state: "PROFILE_CREATED", approvedPreview: p, targetProfileId }) } });
      }
      const target = await checkTarget(targetProfileId);
      if (before && before.profileId !== targetProfileId) {
        if (!canWrite) throw Error("etsy_shipping_unknown_assignment_outcome_review_required");
        if (Date.now() >= Date.parse(p.expiresAt)) throw Error("etsy_shipping_preview_expired");
        // Recheck immediately before the narrow assignment PATCH.
        const current = listingSnapshot(await ctx.request("/listings/" + p.etsyListingId), p.etsyListingId!, ctx.shopId);
        if (fingerprint(current) !== fingerprint(before)) throw Error("etsy_shipping_listing_changed");
        await ctx.request(`/shops/${ctx.shopId}/listings/${p.etsyListingId}`, "PATCH", { shipping_profile_id: targetProfileId });
      }
      const after = p.etsyListingId ? listingSnapshot(await ctx.request("/listings/" + p.etsyListingId), p.etsyListingId, ctx.shopId) : null;
      if (after && (after.profileId !== targetProfileId || after.otherFingerprint !== p.remote?.otherFingerprint)) throw Error("etsy_shipping_listing_verification_failed");
      await checkTarget(targetProfileId);
      await tx.spellmarkListing.update({ where: { id: listing.id }, data: { shippingProfileId: targetProfileId, lastVerifiedAt: null, observationJson: null } });
      const result = { state: "SHIPPING_VERIFIED", productId: input.productId, previewId: saved.id, etsyListingId: p.etsyListingId, targetProfileId, profile: target,
        verifiedAt: new Date().toISOString(), approvedPreview: p, futureListingConfigured: !p.etsyListingId };
      await tx.spellmarkJournal.update({ where: { id: event!.id }, data: { bodyJson: JSON.stringify(result) } });
      return result;
    }, { timeout: 120000, maxWait: 5000 });
  } catch (e) {
    // Preserve the committed SENDING/PROFILE_CREATED marker. A retry is verification-only.
    return { state: "NEEDS_REVIEW", productId: input.productId, previewId: saved.id, targetProfileId, errorCode: safeShippingError(e),
      nextAction: "Inspect the live profile and listing, then retry this preview for verification only. A profile creation or assignment may have completed; this operation never repeats an uncertain write. A new preview requires fresh owner approval." };
  }
}
