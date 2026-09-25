export const SPELLMARK_AI_DISCLOSURE =
  "Created using a combination of original art direction, digital design, and AI-assisted image-making.";

export function withAiAssistedDisclosure(description: string) {
  const base = String(description ?? "").trim();
  if (!base) return SPELLMARK_AI_DISCLOSURE;
  if (base.includes(SPELLMARK_AI_DISCLOSURE)) return base;
  return `${base}\n\n${SPELLMARK_AI_DISCLOSURE}`;
}

export type MarginGateInput = {
  retailPriceCents: number | null;
  productionBaseCents: number | null;
};

export function evaluateBasicMargin(input: MarginGateInput) {
  if (!input.retailPriceCents || input.retailPriceCents <= 0) {
    return {
      ready: false,
      code: "retail_price_missing",
      grossMarginCents: null,
      grossMarginPercent: null,
    } as const;
  }

  if (input.productionBaseCents === null || input.productionBaseCents < 0) {
    return {
      ready: false,
      code: "production_quote_missing",
      grossMarginCents: null,
      grossMarginPercent: null,
    } as const;
  }

  const grossMarginCents = input.retailPriceCents - input.productionBaseCents;
  const grossMarginPercent = Number(((grossMarginCents / input.retailPriceCents) * 100).toFixed(1));

  if (grossMarginCents <= 0) {
    return {
      ready: false,
      code: "non_positive_product_margin",
      grossMarginCents,
      grossMarginPercent,
    } as const;
  }

  return {
    ready: true,
    code: "margin_positive",
    grossMarginCents,
    grossMarginPercent,
  } as const;
}

export function supplierQuoteIsFresh(
  quotedAt: Date | string | null,
  now: Date = new Date(),
  maxAgeHours = 24,
) {
  if (!quotedAt) return false;
  const time = quotedAt instanceof Date ? quotedAt.getTime() : Date.parse(quotedAt);
  if (!Number.isFinite(time)) return false;
  const ageMs = now.getTime() - time;
  return ageMs >= 0 && ageMs <= maxAgeHours * 60 * 60 * 1000;
}
