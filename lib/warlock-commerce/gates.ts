import type { WarlockProductManifest } from "../warlock-mcp/manifest.ts";
import {
  ensureEtsyAiDisclosure,
  estimateEtsyBaseFeesCents,
  hasRequiredEtsyAiDisclosure,
} from "./policy.ts";

export type CommerceGateIssue = {
  gate: "COMPLIANCE" | "MARGIN" | "SUPPLIER";
  level: "error" | "warning";
  code: string;
  message: string;
  variantId?: string;
  listingId?: string;
};

export type CommerceGateReport = {
  pass: boolean;
  errors: CommerceGateIssue[];
  warnings: CommerceGateIssue[];
  compliance: {
    pass: boolean;
    disclosureRequired: true;
    disclosurePresent: boolean;
    disclosureWillBeApplied: boolean;
    etsyDescription: string;
    listings: Array<{
      listingId: string | null;
      fulfillment: "DIGITAL" | "PHYSICAL";
      title: string;
      outboundDescription: string;
      taxonomyId: number | null;
      shippingProfileId: number | null;
      readinessStateId: number | null;
      imageCount: number;
      customerFileCount: number;
      status: string;
      pass: boolean;
    }>;
  };
  margin: {
    pass: boolean;
    minimumContributionMarginPct: number;
    variants: Array<{
      variantId: string;
      label: string;
      fulfillment: "DIGITAL" | "PHYSICAL";
      retailPriceCents: number | null;
      productionBaseCents: number;
      estimatedEtsyBaseFeesCents: number | null;
      estimatedContributionCents: number | null;
      estimatedContributionMarginPct: number | null;
      quoteAgeDays: number | null;
      pass: boolean;
    }>;
  };
  supplier: {
    pass: boolean;
    liveCheckRequired: boolean;
    mappedPhysicalVariants: number;
    totalPhysicalVariants: number;
  };
};

const issue = (
  gate: CommerceGateIssue["gate"],
  level: CommerceGateIssue["level"],
  code: string,
  message: string,
  context?: { variantId?: string; listingId?: string },
): CommerceGateIssue => ({ gate, level, code, message, ...context });

function daysOld(date: Date, now: Date) {
  return Math.max(0, (now.getTime() - date.getTime()) / 86_400_000);
}

function minimumMarginPct() {
  const configured = Number(process.env.WARLOCK_MIN_CONTRIBUTION_MARGIN_PCT ?? 20);
  return Number.isFinite(configured) && configured >= 0 && configured <= 95 ? configured : 20;
}

function quoteMaxAgeDays() {
  const configured = Number(process.env.WARLOCK_MAX_PRODUCTION_QUOTE_AGE_DAYS ?? 7);
  return Number.isFinite(configured) && configured >= 1 && configured <= 90 ? configured : 7;
}

export function evaluateCommerceGates(
  manifest: WarlockProductManifest,
  now = new Date(),
): CommerceGateReport {
  const errors: CommerceGateIssue[] = [];
  const warnings: CommerceGateIssue[] = [];
  const listings = manifest.listings ?? [];
  const digitalVariants = manifest.variants.filter((variant) => variant.fulfillment === "DIGITAL");
  if (digitalVariants.length > 1) {
    errors.push(issue(
      "COMPLIANCE",
      "error",
      "digital_variations_not_supported",
      "Etsy digital listings do not support variations; keep exactly one digital fulfillment variant per digital listing.",
    ));
  }

  const requiredFulfillments = [...new Set(
    manifest.variants.map((variant) => variant.fulfillment),
  )] as Array<"DIGITAL" | "PHYSICAL">;

  const listingReports = requiredFulfillments.map((fulfillment) => {
    const listing = listings.find((candidate) => candidate.fulfillment === fulfillment);
    if (!listing) {
      errors.push(issue(
        "COMPLIANCE",
        "error",
        "listing_manifest_missing",
        fulfillment + " fulfillment exists but has no canonical Etsy listing manifest.",
      ));
      return {
        listingId: null,
        fulfillment,
        title: "",
        outboundDescription: "",
        taxonomyId: null,
        shippingProfileId: null,
        readinessStateId: null,
        imageCount: 0,
        customerFileCount: 0,
        status: "MISSING",
        pass: false,
      };
    }

    const outboundDescription = ensureEtsyAiDisclosure(listing.description);
    const disclosurePresent = hasRequiredEtsyAiDisclosure(listing.description);
    const imageCount = listing.assets.filter((link) => link.kind === "image").length;
    const customerFileCount = listing.assets.filter((link) => link.kind === "customer_file").length;
    let pass = true;

    if (!disclosurePresent) {
      warnings.push(issue(
        "COMPLIANCE",
        "warning",
        "ai_disclosure_injected",
        "Required Etsy AI-assistance disclosure will be appended to the " + fulfillment.toLowerCase() + " listing before Etsy receives it.",
        { listingId: listing.id },
      ));
    }
    if (!listing.title.trim()) {
      pass = false;
      errors.push(issue(
        "COMPLIANCE",
        "error",
        "listing_title_missing",
        fulfillment + " Etsy listing title is missing.",
        { listingId: listing.id },
      ));
    }
    if (!listing.taxonomyId) {
      pass = false;
      errors.push(issue(
        "COMPLIANCE",
        "error",
        "listing_taxonomy_missing",
        fulfillment + " Etsy listing needs an Etsy taxonomy ID.",
        { listingId: listing.id },
      ));
    }
    if (imageCount === 0) {
      pass = false;
      errors.push(issue(
        "COMPLIANCE",
        "error",
        "listing_images_missing",
        fulfillment + " Etsy listing has no assigned listing images.",
        { listingId: listing.id },
      ));
    }
    if (fulfillment === "PHYSICAL") {
      if (!listing.shippingProfileId) {
        pass = false;
        errors.push(issue(
          "COMPLIANCE",
          "error",
          "shipping_profile_missing",
          "Physical Etsy listing needs a shipping profile.",
          { listingId: listing.id },
        ));
      }
      if (!listing.readinessStateId) {
        pass = false;
        errors.push(issue(
          "COMPLIANCE",
          "error",
          "readiness_state_missing",
          "Physical Etsy listing needs a processing/readiness state.",
          { listingId: listing.id },
        ));
      }
    } else {
      const customerFiles = listing.assets.filter((link) => link.kind === "customer_file");
      if (customerFileCount === 0) {
        pass = false;
        errors.push(issue(
          "COMPLIANCE",
          "error",
          "digital_customer_files_missing",
          "Digital Etsy listing has no assigned customer download file.",
          { listingId: listing.id },
        ));
      }
      if (customerFileCount > 5) {
        pass = false;
        errors.push(issue(
          "COMPLIANCE",
          "error",
          "digital_file_count_exceeded",
          "Etsy instant-download listings support at most five customer files.",
          { listingId: listing.id },
        ));
      }

      const allowedExtensions = new Set([
        "bmp", "doc", "gif", "jpeg", "jpg", "mobi", "mov", "mp3", "mpeg",
        "pdf", "png", "psp", "rtf", "stl", "txt", "zip", "epub", "ibook",
      ]);
      for (const link of customerFiles) {
        const fileName = link.asset.fileName;
        const extension = fileName.includes(".") ? fileName.split(".").pop()?.toLowerCase() ?? "" : "";
        if (link.asset.byteSize > 20 * 1024 * 1024) {
          pass = false;
          errors.push(issue(
            "COMPLIANCE",
            "error",
            "digital_file_too_large",
            "Etsy customer file " + fileName + " exceeds the 20 MB per-file limit.",
            { listingId: listing.id },
          ));
        }
        if (fileName.length > 70 || !/^[A-Za-z0-9._-]+$/.test(fileName)) {
          pass = false;
          errors.push(issue(
            "COMPLIANCE",
            "error",
            "digital_file_name_invalid",
            "Etsy customer file names must be 70 characters or fewer and use only letters, numbers, periods, underscores, or hyphens.",
            { listingId: listing.id },
          ));
        }
        if (!allowedExtensions.has(extension)) {
          pass = false;
          errors.push(issue(
            "COMPLIANCE",
            "error",
            "digital_file_type_unsupported",
            "Etsy does not support the customer file type for " + fileName + ".",
            { listingId: listing.id },
          ));
        }
      }
    }
    if (listing.status !== "READY" && listing.status !== "DRAFT_CREATED" && listing.status !== "WAITING_PRINTFUL" && listing.status !== "SYNCED") {
      pass = false;
      errors.push(issue(
        "COMPLIANCE",
        "error",
        "listing_not_ready",
        fulfillment + " Etsy listing manifest is still in CONFIG status.",
        { listingId: listing.id },
      ));
    }

    return {
      listingId: listing.id,
      fulfillment,
      title: listing.title,
      outboundDescription,
      taxonomyId: listing.taxonomyId,
      shippingProfileId: listing.shippingProfileId,
      readinessStateId: listing.readinessStateId,
      imageCount,
      customerFileCount,
      status: listing.status,
      pass,
    };
  });

  const minMarginPct = minimumMarginPct();
  const maxQuoteAge = quoteMaxAgeDays();
  const variantMargins = manifest.variants.map((variant) => {
    const productionBaseCents = variant.fulfillment === "DIGITAL" ? 0 : (variant.productionBaseCents ?? 0);
    const fees = variant.retailPriceCents ? estimateEtsyBaseFeesCents(variant.retailPriceCents) : null;
    const contribution = variant.retailPriceCents && fees !== null
      ? variant.retailPriceCents - productionBaseCents - fees
      : null;
    const contributionPct = contribution !== null && variant.retailPriceCents
      ? (contribution / variant.retailPriceCents) * 100
      : null;
    const quoteDate = variant.productionQuotedAt ? new Date(variant.productionQuotedAt) : null;
    const quoteAgeDays = quoteDate && !Number.isNaN(quoteDate.getTime()) ? daysOld(quoteDate, now) : null;
    let pass = true;

    if (!variant.retailPriceCents || variant.retailPriceCents <= 0) {
      pass = false;
      errors.push(issue("MARGIN", "error", "retail_price_missing", "Variant " + variant.label + " has no retail price.", { variantId: variant.id }));
    }

    if (variant.fulfillment === "PHYSICAL") {
      if (variant.productionBaseCents === null || variant.productionBaseCents <= 0) {
        pass = false;
        errors.push(issue(
          "MARGIN",
          "error",
          "production_cost_missing",
          "Physical variant " + variant.label + " needs a current Printful production-base quote.",
          { variantId: variant.id },
        ));
      }
      if (quoteAgeDays === null) {
        pass = false;
        errors.push(issue(
          "MARGIN",
          "error",
          "production_quote_missing",
          "Physical variant " + variant.label + " has no production quote timestamp.",
          { variantId: variant.id },
        ));
      } else if (quoteAgeDays > maxQuoteAge) {
        pass = false;
        errors.push(issue(
          "MARGIN",
          "error",
          "production_quote_stale",
          "Physical variant " + variant.label + " has a production quote older than " + maxQuoteAge + " days.",
          { variantId: variant.id },
        ));
      }
    }

    if (contributionPct !== null && contributionPct < minMarginPct) {
      pass = false;
      errors.push(issue(
        "MARGIN",
        "error",
        "contribution_margin_below_floor",
        "Variant " + variant.label + " is below the configured " + minMarginPct + "% estimated contribution-margin floor.",
        { variantId: variant.id },
      ));
    }

    return {
      variantId: variant.id,
      label: variant.label,
      fulfillment: variant.fulfillment,
      retailPriceCents: variant.retailPriceCents,
      productionBaseCents,
      estimatedEtsyBaseFeesCents: fees,
      estimatedContributionCents: contribution,
      estimatedContributionMarginPct: contributionPct === null ? null : Number(contributionPct.toFixed(1)),
      quoteAgeDays: quoteAgeDays === null ? null : Number(quoteAgeDays.toFixed(1)),
      pass,
    };
  });

  const physical = manifest.variants.filter((variant) => variant.fulfillment === "PHYSICAL");
  const mappedPhysical = physical.filter(
    (variant) => variant.printfulProductId && variant.printfulVariantId && variant.printfulStoreId,
  );

  if (mappedPhysical.length !== physical.length) {
    errors.push(issue(
      "SUPPLIER",
      "error",
      "printful_mapping_incomplete",
      "Every physical variant must have a Printful product, variant, and store mapping before execution.",
    ));
  }

  if (physical.length > 0) {
    warnings.push(issue(
      "SUPPLIER",
      "warning",
      "live_supplier_preflight_required",
      "A live Printful availability check is required immediately before any external write.",
    ));
  }

  warnings.push(issue(
    "MARGIN",
    "warning",
    "fee_model_exclusions",
    "Margin estimate excludes shipping, sales tax, Etsy Ads, Offsite Ads, currency conversion, refunds, and other optional or order-specific fees.",
  ));

  const compliancePass = listingReports.every((listing) => listing.pass)
    && !errors.some((entry) => entry.gate === "COMPLIANCE");
  const marginPass = variantMargins.every((variant) => variant.pass);
  const supplierPass = mappedPhysical.length === physical.length;
  const disclosurePresent = listingReports.every((listing) => {
    const source = listings.find((candidate) => candidate.id === listing.listingId);
    return source ? hasRequiredEtsyAiDisclosure(source.description) : false;
  });
  const fallbackDescription = listingReports[0]?.outboundDescription
    ?? ensureEtsyAiDisclosure(manifest.description);

  return {
    pass: compliancePass && marginPass && supplierPass && errors.length === 0,
    errors,
    warnings,
    compliance: {
      pass: compliancePass,
      disclosureRequired: true,
      disclosurePresent,
      disclosureWillBeApplied: !disclosurePresent,
      etsyDescription: fallbackDescription,
      listings: listingReports,
    },
    margin: {
      pass: marginPass,
      minimumContributionMarginPct: minMarginPct,
      variants: variantMargins,
    },
    supplier: {
      pass: supplierPass,
      liveCheckRequired: physical.length > 0,
      mappedPhysicalVariants: mappedPhysical.length,
      totalPhysicalVariants: physical.length,
    },
  };
}
