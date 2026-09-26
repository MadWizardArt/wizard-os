import { etsyHeaders } from "../etsy-client";
import { getWarlockEtsyOperatorContext } from "../warlock-auth";
import { prisma } from "../prisma";
import type { WarlockProductManifest } from "../warlock-mcp/manifest.ts";
import {
  configuredListingStatus,
  listingConfigurationBlockers,
  validateEtsyConfigurationSelection,
  type EtsyConfigurationSelection,
} from "./etsy-config-selection.ts";
import {
  flattenSellerTaxonomy,
  type EtsyTaxonomyNode,
} from "./etsy-taxonomy.ts";

const ETSY_API = "https://api.etsy.com/v3/application";
type Json = Record<string, unknown>;

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

function resultArray(payload: Json) {
  return Array.isArray(payload.results)
    ? payload.results.filter((entry): entry is Json => Boolean(entry && typeof entry === "object"))
    : [];
}

function positiveId(value: unknown) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

function externalId(value: unknown) {
  const text = String(value ?? "").trim();
  return /^[1-9]\d{0,18}$/.test(text) ? text : null;
}

function listingNumber(payload: Json | null, key: string) {
  return payload ? positiveId(payload[key]) : null;
}

function listingExternalId(payload: Json | null, key: string) {
  return payload ? externalId(payload[key]) : null;
}

export async function applyVerifiedEtsyConfiguration(
  manifest: WarlockProductManifest,
  selection: EtsyConfigurationSelection,
) {
  const inputErrors = validateEtsyConfigurationSelection(selection);
  if (inputErrors.length) {
    throw new Error("invalid_etsy_configuration:" + inputErrors.join(","));
  }

  const listing = manifest.listings.find(
    (candidate) => candidate.fulfillment === selection.fulfillment,
  );
  if (!listing) throw new Error("canonical_listing_missing");

  if (listing.status === "SYNCED" || listing.status === "WAITING_PRINTFUL") {
    throw new Error("listing_configuration_locked_after_printful_sync");
  }

  const { auth, shopId } = await getWarlockEtsyOperatorContext();
  const token = auth.session.access_token;

  const taxonomyPayload = await getJson(token, "/seller-taxonomy/nodes");
  const taxonomy = flattenSellerTaxonomy(
    resultArray(taxonomyPayload) as unknown as EtsyTaxonomyNode[],
  );
  const taxonomyNode = taxonomy.find((node) => node.id === selection.taxonomyId);
  if (!taxonomyNode) throw new Error("etsy_taxonomy_not_found");

  let shippingProfile: Json | null = null;
  let readinessProfile: Json | null = null;

  if (selection.fulfillment === "PHYSICAL") {
    shippingProfile = await getJson(
      token,
      "/shops/" + shopId + "/shipping-profiles/" + selection.shippingProfileId,
    );
    readinessProfile = await getJson(
      token,
      "/shops/" + shopId + "/readiness-state-definitions/" + selection.readinessStateId,
    );

    if (externalId(shippingProfile.shipping_profile_id) !== selection.shippingProfileId) {
      throw new Error("etsy_shipping_profile_mismatch");
    }
    if (externalId(readinessProfile.readiness_state_id) !== selection.readinessStateId) {
      throw new Error("etsy_readiness_state_mismatch");
    }
  }

  let existingEtsyListing: Json | null = null;
  if (listing.etsyListingId) {
    existingEtsyListing = await getJson(
      token,
      "/listings/" + encodeURIComponent(listing.etsyListingId),
    );

    if (String(existingEtsyListing.state ?? "") !== "draft") {
      throw new Error("existing_etsy_listing_not_draft");
    }

    const liveTaxonomy = listingNumber(existingEtsyListing, "taxonomy_id");
    const liveShipping = listingExternalId(existingEtsyListing, "shipping_profile_id");
    const liveReadiness = listingExternalId(existingEtsyListing, "readiness_state_id");

    if (liveTaxonomy && liveTaxonomy !== selection.taxonomyId) {
      throw new Error("existing_etsy_taxonomy_mismatch");
    }
    if (
      selection.fulfillment === "PHYSICAL" &&
      liveShipping &&
      liveShipping !== selection.shippingProfileId
    ) {
      throw new Error("existing_etsy_shipping_profile_mismatch");
    }
    if (
      selection.fulfillment === "PHYSICAL" &&
      liveReadiness &&
      liveReadiness !== selection.readinessStateId
    ) {
      throw new Error("existing_etsy_readiness_state_mismatch");
    }
  }

  const blockers = listingConfigurationBlockers(listing, selection);
  const status = configuredListingStatus(listing, blockers);

  const saved = await prisma.spellmarkListing.update({
    where: { id: listing.id },
    data: {
      taxonomyId: selection.taxonomyId,
      shippingProfileId: selection.fulfillment === "PHYSICAL"
        ? selection.shippingProfileId ?? null
        : null,
      readinessStateId: selection.fulfillment === "PHYSICAL"
        ? selection.readinessStateId ?? null
        : null,
      status,
    },
    select: {
      id: true,
      fulfillment: true,
      taxonomyId: true,
      shippingProfileId: true,
      readinessStateId: true,
      etsyListingId: true,
      status: true,
    },
  });

  return {
    productId: manifest.id,
    listing: saved,
    verifiedAgainstEtsy: {
      shopId,
      taxonomy: {
        id: taxonomyNode.id,
        name: taxonomyNode.name,
        path: taxonomyNode.path,
      },
      shippingProfile: shippingProfile ? {
        id: externalId(shippingProfile.shipping_profile_id),
        title: typeof shippingProfile.title === "string" ? shippingProfile.title : null,
      } : null,
      readinessProfile: readinessProfile ? {
        id: externalId(readinessProfile.readiness_state_id),
        readinessState: typeof readinessProfile.readiness_state === "string"
          ? readinessProfile.readiness_state
          : null,
        label: typeof readinessProfile.processing_days_display_label === "string"
          ? readinessProfile.processing_days_display_label
          : null,
      } : null,
      existingEtsyListingId: listing.etsyListingId,
    },
    configurationBlockers: blockers,
    externalEtsyMutation: false,
  };
}
