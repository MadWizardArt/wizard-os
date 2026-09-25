import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { buildWarlockDryRun, validateWarlockManifest } from "./manifest";
import { findWarlockProduct } from "./repository";

const selectorSchema = z.object({
  productId: z.string().trim().min(1).max(100).optional(),
  title: z.string().trim().min(1).max(140).optional(),
}).refine((value) => Boolean(value.productId) !== Boolean(value.title), {
  message: "Provide exactly one of productId or title.",
});

const annotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

function success(payload: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  };
}

function failure(code: string, message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: JSON.stringify({ error: code, message }) }],
  };
}

async function loadProduct(selector: z.infer<typeof selectorSchema>) {
  try {
    const product = await findWarlockProduct(selector);
    if (!product) return { error: failure("product_not_found", "No canonical Spellmark product matched that selector.") };
    return { product };
  } catch (error) {
    if (error instanceof Error && error.message === "warlock_product_title_ambiguous") {
      return { error: failure("product_title_ambiguous", "More than one product has that title. Use productId instead.") };
    }
    console.error("Warlock MCP product lookup failed", error);
    return { error: failure("warlock_lookup_failed", "Warlock could not load the canonical product.") };
  }
}

export function createWarlockCommerceMcpServer() {
  const server = new McpServer({
    name: "warlock-commerce",
    version: "0.1.0",
  });

  server.registerTool(
    "get_product",
    {
      title: "Get Spellmark Product",
      description: "Read one canonical Spellmark product, including its assets, variants, Printful mappings, prices, and Etsy listing IDs.",
      inputSchema: selectorSchema,
      annotations,
    },
    async (selector) => {
      const loaded = await loadProduct(selector);
      if ("error" in loaded) return loaded.error;
      return success({ product: loaded.product });
    },
  );

  server.registerTool(
    "validate_product_package",
    {
      title: "Validate Product Package",
      description: "Validate a canonical product package before any Etsy or Printful write action is allowed.",
      inputSchema: selectorSchema,
      annotations,
    },
    async (selector) => {
      const loaded = await loadProduct(selector);
      if ("error" in loaded) return loaded.error;
      return success({
        productId: loaded.product.id,
        title: loaded.product.title,
        validation: validateWarlockManifest(loaded.product),
      });
    },
  );

  server.registerTool(
    "dry_run_product",
    {
      title: "Dry Run Product Production",
      description: "Return the exact planned Warlock, Printful, and Etsy production sequence without changing any external system.",
      inputSchema: selectorSchema,
      annotations,
    },
    async (selector) => {
      const loaded = await loadProduct(selector);
      if ("error" in loaded) return loaded.error;
      return success(buildWarlockDryRun(loaded.product));
    },
  );

  server.registerTool(
    "get_production_status",
    {
      title: "Get Product Production Status",
      description: "Summarize canonical fulfillment mappings and readiness without contacting or modifying Etsy or Printful.",
      inputSchema: selectorSchema,
      annotations,
    },
    async (selector) => {
      const loaded = await loadProduct(selector);
      if ("error" in loaded) return loaded.error;
      const validation = validateWarlockManifest(loaded.product);
      const physical = loaded.product.variants.filter((variant) => variant.fulfillment === "PHYSICAL");
      const digital = loaded.product.variants.filter((variant) => variant.fulfillment === "DIGITAL");
      return success({
        productId: loaded.product.id,
        title: loaded.product.title,
        status: loaded.product.status,
        readyToExecute: validation.ready,
        physical: {
          variants: physical.length,
          mappedToPrintful: physical.filter((variant) => variant.printfulVariantId && variant.printfulStoreId).length,
          etsyListingIds: [...new Set(physical.map((variant) => variant.etsyListingId).filter(Boolean))],
        },
        digital: {
          variants: digital.length,
          customerFiles: loaded.product.assets.filter((asset) => asset.role === "customer_file").length,
          etsyListingIds: [...new Set(digital.map((variant) => variant.etsyListingId).filter(Boolean))],
        },
        validation,
      });
    },
  );

  return server;
}
