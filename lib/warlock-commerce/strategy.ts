import type { WarlockProductManifest } from "../warlock-mcp/manifest.ts";

export type PhysicalExecutionStrategy = {
  strategy: "DIGITAL_ONLY" | "ETSY_FIRST_PRINTFUL_SYNC";
  mixedCatalogProducts: boolean;
  catalogProductIds: number[];
  reason: string;
};

export function selectPhysicalExecutionStrategy(
  manifest: WarlockProductManifest,
): PhysicalExecutionStrategy {
  const physical = manifest.variants.filter((variant) => variant.fulfillment === "PHYSICAL");
  if (physical.length === 0) {
    return {
      strategy: "DIGITAL_ONLY",
      mixedCatalogProducts: false,
      catalogProductIds: [],
      reason: "No physical fulfillment variants are present.",
    };
  }

  const catalogProductIds = [...new Set(
    physical.map((variant) => variant.printfulProductId).filter((id): id is number => Boolean(id)),
  )];

  return {
    strategy: "ETSY_FIRST_PRINTFUL_SYNC",
    mixedCatalogProducts: catalogProductIds.length > 1,
    catalogProductIds,
    reason: catalogProductIds.length > 1
      ? "The Etsy listing contains variants from multiple Printful catalog products, so Etsy must own the listing and Printful variants are synced afterward."
      : "API-managed external-commerce products are created on Etsy first, then configured through Printful's ecommerce-platform sync API.",
  };
}
