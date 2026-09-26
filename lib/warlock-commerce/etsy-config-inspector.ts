import { etsyHeaders } from "../etsy-client";
import { getWarlockEtsyOperatorContext } from "../warlock-auth";
import type { WarlockProductManifest } from "../warlock-mcp/manifest.ts";
import {
  rankSellerTaxonomy,
  type EtsyTaxonomyNode,
} from "./etsy-taxonomy.ts";

const ETSY_API = "https://api.etsy.com/v3/application";

type Json = Record<string, unknown>;

function resultArray(payload: Json) {
  return Array.isArray(payload.results)
    ? payload.results.filter((entry): entry is Json => Boolean(entry && typeof entry === "object"))
    : [];
}

async function getJson(accessToken: string, path: string) {
  const response = await fetch(ETSY_API + path, {
    method: "GET",
    headers: etsyHeaders(accessToken),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json().catch(() => ({})) as Json;
  if (!response.ok) {
    const error = new Error("etsy_http_" + response.status);
    Object.assign(error, { status: response.status, payload });
    throw error;
  }
  return payload;
}

function numberId(value: unknown) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

function nonNegativeInteger(value: unknown) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}

function text(value: unknown) {
  return typeof value === "string" ? value : null;
}

function deriveTaxonomyQuery(manifest: WarlockProductManifest) {
  const physical = manifest.listings.find((listing) => listing.fulfillment === "PHYSICAL");
  let tags: string[] = [];
  if (physical?.tagsJson) {
    try {
      const parsed = JSON.parse(physical.tagsJson);
      if (Array.isArray(parsed)) tags = parsed.map((tag) => String(tag));
    } catch {
      tags = [];
    }
  }
  return [
    physical?.title,
    manifest.title,
    manifest.collection,
    ...tags,
    "art print wall art",
  ].filter(Boolean).join(" ");
}

function normalizeShippingProfiles(payload: Json) {
  return resultArray(payload).map((profile) => ({
    shippingProfileId: numberId(profile.shipping_profile_id),
    title: text(profile.title),
    originCountryIso: text(profile.origin_country_iso),
    minProcessingDays: nonNegativeInteger(profile.min_processing_days),
    maxProcessingDays: nonNegativeInteger(profile.max_processing_days),
  })).filter((profile) => profile.shippingProfileId);
}

function normalizeReadinessStates(payload: Json) {
  return resultArray(payload).map((state) => ({
    readinessStateId: numberId(state.readiness_state_id),
    readinessState: text(state.readiness_state),
    minProcessingDays: nonNegativeInteger(state.min_processing_days),
    maxProcessingDays: nonNegativeInteger(state.max_processing_days),
    label: text(state.processing_days_display_label),
  })).filter((state) => state.readinessStateId);
}

function taxonomyNodes(payload: Json) {
  return resultArray(payload) as unknown as EtsyTaxonomyNode[];
}

function existingListingSummary(payload: Json | null) {
  if (!payload) return null;
  return {
    listingId: String(payload.listing_id ?? ""),
    title: text(payload.title),
    state: text(payload.state),
    taxonomyId: numberId(payload.taxonomy_id),
    shippingProfileId: numberId(payload.shipping_profile_id),
    readinessStateId: numberId(payload.readiness_state_id),
    type: text(payload.type),
  };
}

export async function inspectEtsyConfiguration(
  manifest: WarlockProductManifest,
  taxonomyQuery?: string,
) {
  const { auth, shopId } = await getWarlockEtsyOperatorContext();
  const accessToken = auth.session.access_token;
  const physical = manifest.listings.find((listing) => listing.fulfillment === "PHYSICAL") ?? null;

  const [shippingPayload, readinessPayload, taxonomyPayload] = await Promise.all([
    getJson(accessToken, "/shops/" + shopId + "/shipping-profiles"),
    getJson(accessToken, "/shops/" + shopId + "/readiness-state-definitions?limit=100"),
    getJson(accessToken, "/seller-taxonomy/nodes"),
  ]);

  let existingListing: Json | null = null;
  if (physical?.etsyListingId) {
    try {
      existingListing = await getJson(
        accessToken,
        "/listings/" + encodeURIComponent(physical.etsyListingId),
      );
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("etsy_http_404")) throw error;
    }
  }

  const query = taxonomyQuery?.trim() || deriveTaxonomyQuery(manifest);
  const shippingProfiles = normalizeShippingProfiles(shippingPayload);
  const readinessStates = normalizeReadinessStates(readinessPayload);
  const taxonomyCandidates = rankSellerTaxonomy(taxonomyNodes(taxonomyPayload), query);

  return {
    productId: manifest.id,
    title: manifest.title,
    shopId,
    currentCanonical: physical ? {
      listingId: physical.id,
      etsyListingId: physical.etsyListingId,
      taxonomyId: physical.taxonomyId,
      shippingProfileId: physical.shippingProfileId,
      readinessStateId: physical.readinessStateId,
      status: physical.status,
    } : null,
    existingEtsyListing: existingListingSummary(existingListing),
    shippingProfiles,
    readinessStates,
    taxonomy: {
      query,
      candidates: taxonomyCandidates,
      autoSelected: false,
    },
    unresolved: {
      taxonomy: !physical?.taxonomyId,
      shippingProfile: !physical?.shippingProfileId,
      readinessState: !physical?.readinessStateId,
    },
    readOnly: true,
  };
}
