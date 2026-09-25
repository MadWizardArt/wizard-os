import type { WarlockProductManifest } from "../warlock-mcp/manifest";
import {
  ensureEtsyAiDisclosure,
  estimateEtsyBaseFeesCents,
  hasRequiredEtsyAiDisclosure,
} from "./policy";

export type CommerceGateIssue = {
  gate: "COMPLIANCE" | "MARGIN" | "SUPPLIER";
  level: "error" | "warning";
  code: string;
  message: string;
  variantId?: string;
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
  variantId?: string,
): CommerceGateIssue => ({ gate, level, code, message, ...(variantId ? { variantId } : {}) });

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
  const etsyDescription = ensureEtsyAiDisclosure(manifest.description);
  const disclosurePresent = hasRequiredEtsyAiDisclosure(manifest.description);

  if (!disclosurePresent) {
    warnings.push(issue(
      "COMPLIANCE",
      "warning",
      "ai_disclosure_injected",
      "Required Etsy AI-assistance disclosure was missing from canonical copy and will be appended before Etsy receives the listing.",
    ));
  }

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
      errors.push(issue("MARGIN", "error", "retail_price_missing", "Variant " + variant.label + " has no retail price.", variant.id));
    }

    if (variant.fulfillment === "PHYSICAL") {
      if (variant.productionBaseCents === null || variant.productionBaseCents <= 0) {
        pass = false;
        errors.push(issue(
          "MARGIN",
          "error",
          "production_cost_missing",
          "Physical variant " + variant.label + " needs a current Printful production-base quote.",
          variant.id,
        ));
      }
      if (quoteAgeDays === null) {
        pass = false;
        errors.push(issue(
          "MARGIN",
          "error",
          "production_quote_missing",
          "Physical variant " + variant.label + " has no production quote timestamp.",
          variant.id,
        ));
      } else if (quoteAgeDays > maxQuoteAge) {
        pass = false;
        errors.push(issue(
          "MARGIN",
          "error",
          "production_quote_stale",
          "Physical variant " + variant.label + " has a production quote older than " + maxQuoteAge + " days.",
          variant.id,
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
        variant.id,
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

  const compliancePass = Boolean(manifest.title.trim() && etsyDescription.trim());
  const marginPass = variantMargins.every((variant) => variant.pass);
  const supplierPass = mappedPhysical.length === physical.length;

  return {
    pass: compliancePass && marginPass && supplierPass && errors.length === 0,
    errors,
    warnings,
    compliance: {
      pass: compliancePass,
      disclosureRequired: true,
      disclosurePresent,
      disclosureWillBeApplied: !disclosurePresent,
      etsyDescription,
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
