export const ETSY_AI_DISCLOSURE =
  "Created using a combination of original art direction, digital design, and AI-assisted image-making.";

export const ETSY_FEE_MODEL_US = {
  effectiveDate: "2026-09-25",
  listingFeeCents: 20,
  transactionRate: 0.065,
  paymentProcessingRate: 0.03,
  paymentProcessingFixedCents: 25,
} as const;

export function hasRequiredEtsyAiDisclosure(description: string) {
  return description.includes(ETSY_AI_DISCLOSURE);
}

export function ensureEtsyAiDisclosure(description: string) {
  const clean = description.trim();
  if (hasRequiredEtsyAiDisclosure(clean)) return clean;
  return [clean, ETSY_AI_DISCLOSURE].filter(Boolean).join("\n\n");
}

export function estimateEtsyBaseFeesCents(retailPriceCents: number) {
  if (!Number.isFinite(retailPriceCents) || retailPriceCents <= 0) return null;
  const transaction = Math.round(retailPriceCents * ETSY_FEE_MODEL_US.transactionRate);
  const processing = Math.round(retailPriceCents * ETSY_FEE_MODEL_US.paymentProcessingRate)
    + ETSY_FEE_MODEL_US.paymentProcessingFixedCents;
  return ETSY_FEE_MODEL_US.listingFeeCents + transaction + processing;
}
