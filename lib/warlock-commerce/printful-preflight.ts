import type { WarlockProductManifest } from "../warlock-mcp/manifest.ts";

const API = "https://api.printful.com";

type Json = Record<string, unknown>;

export type SupplierVariantCheck = {
  variantId: string;
  label: string;
  printfulProductId: number;
  printfulVariantId: number;
  printfulStoreId: number;
  catalogVariantExists: boolean;
  catalogProductMatches: boolean;
  storeAccessible: boolean;
  availability: "in_stock" | "unavailable" | "unknown";
  pass: boolean;
};

export type SupplierPreflight = {
  configured: boolean;
  pass: boolean;
  checkedAt: string;
  variants: SupplierVariantCheck[];
  errors: string[];
};

function positiveId(value: unknown) {
  const valueNumber = Number(value);
  return Number.isSafeInteger(valueNumber) && valueNumber > 0 ? valueNumber : null;
}

async function getJson(path: string, storeId?: number) {
  const token = process.env.PRINTFUL_PRIVATE_TOKEN?.trim();
  if (!token) throw new Error("printful_token_missing");

  const headers: Record<string, string> = {
    Authorization: "Bearer " + token,
    "X-PF-Language": "en_US",
  };
  if (storeId) headers["X-PF-Store-Id"] = String(storeId);

  const response = await fetch(API + path, {
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error("printful_http_" + response.status);
  return response.json() as Promise<Json>;
}

function availabilityFrom(payload: Json) {
  const data = payload.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return "unknown" as const;
  const techniques = (data as Json).techniques;
  if (!Array.isArray(techniques)) return "unknown" as const;

  const statuses = techniques.flatMap((technique) => {
    const regions = technique && typeof technique === "object" ? (technique as Json).selling_regions : null;
    if (!Array.isArray(regions)) return [];
    return regions.map((region) => {
      if (!region || typeof region !== "object") return "";
      return String((region as Json).availability ?? "").toLowerCase();
    });
  });

  if (statuses.some((status) => status === "in stock")) return "in_stock" as const;
  if (statuses.length > 0) return "unavailable" as const;
  return "unknown" as const;
}

export async function runPrintfulSupplierPreflight(
  manifest: WarlockProductManifest,
): Promise<SupplierPreflight> {
  const physical = manifest.variants.filter((variant) => variant.fulfillment === "PHYSICAL");
  const configured = Boolean(process.env.PRINTFUL_PRIVATE_TOKEN?.trim());

  if (physical.length === 0) {
    return {
      configured,
      pass: true,
      checkedAt: new Date().toISOString(),
      variants: [],
      errors: [],
    };
  }

  if (!configured) {
    return {
      configured: false,
      pass: false,
      checkedAt: new Date().toISOString(),
      variants: [],
      errors: ["printful_token_missing"],
    };
  }

  const errors: string[] = [];
  let stores: unknown[] = [];
  try {
    const storesPayload = await getJson("/stores");
    stores = Array.isArray(storesPayload.result) ? storesPayload.result : [];
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "printful_store_lookup_failed");
  }

  const checks: SupplierVariantCheck[] = [];
  for (const variant of physical) {
    if (!variant.printfulProductId || !variant.printfulVariantId || !variant.printfulStoreId) {
      errors.push("printful_mapping_incomplete:" + variant.id);
      continue;
    }

    let catalogVariantExists = false;
    let catalogProductMatches = false;
    let availability: SupplierVariantCheck["availability"] = "unknown";

    try {
      const detail = await getJson("/products/variant/" + variant.printfulVariantId, variant.printfulStoreId);
      const result = detail.result;
      if (result && typeof result === "object" && !Array.isArray(result)) {
        const row = result as Json;
        const catalogVariant = row.variant && typeof row.variant === "object"
          ? row.variant as Json
          : row;
        catalogVariantExists = positiveId(catalogVariant.id) === variant.printfulVariantId;
        catalogProductMatches = positiveId(catalogVariant.product_id) === variant.printfulProductId;
      }
    } catch (error) {
      errors.push(
        "catalog_lookup_failed:" + variant.id + ":" +
        (error instanceof Error ? error.message : "unknown"),
      );
    }

    try {
      const stock = await getJson(
        "/v2/catalog-variants/" + variant.printfulVariantId +
          "/availability?selling_region_name=north_america",
        variant.printfulStoreId,
      );
      availability = availabilityFrom(stock);
    } catch (error) {
      errors.push(
        "availability_lookup_failed:" + variant.id + ":" +
        (error instanceof Error ? error.message : "unknown"),
      );
    }

    const storeAccessible = stores.some((store) => {
      if (!store || typeof store !== "object") return false;
      return positiveId((store as Json).id) === variant.printfulStoreId;
    });

    const pass =
      catalogVariantExists &&
      catalogProductMatches &&
      storeAccessible &&
      availability === "in_stock";

    checks.push({
      variantId: variant.id,
      label: variant.label,
      printfulProductId: variant.printfulProductId,
      printfulVariantId: variant.printfulVariantId,
      printfulStoreId: variant.printfulStoreId,
      catalogVariantExists,
      catalogProductMatches,
      storeAccessible,
      availability,
      pass,
    });
  }

  return {
    configured: true,
    pass: checks.length === physical.length && checks.every((check) => check.pass) && errors.length === 0,
    checkedAt: new Date().toISOString(),
    variants: checks,
    errors,
  };
}
