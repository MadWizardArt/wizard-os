import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { buildWarlockDryRun, validateWarlockManifest } from "./manifest";
import type { WarlockProductManifest } from "./manifest";
import { findWarlockProduct } from "./repository";
import { evaluateCommerceGates } from "../warlock-commerce/gates";
import { runPrintfulSupplierPreflight } from "../warlock-commerce/printful-preflight";

const selectorShape = {
  productId: z.string().trim().min(1).max(100).optional(),
  title: z.string().trim().min(1).max(140).optional(),
};

type ProductSelector = {
  productId?: string;
  title?: string;
};

const annotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const liveReadAnnotations = {
  ...annotations,
  openWorldHint: true,
} as const;

function success(payload: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  };
}

function failure(code: string, message: string) {
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: JSON.stringify({ error: code, message }) }],
  };
}

type ToolFailure = ReturnType<typeof failure>;
type LoadedProduct =
  | { ok: true; product: WarlockProductManifest }
  | { ok: false; error: ToolFailure };

function validSelector(selector: ProductSelector) {
  return Boolean(selector.productId) !== Boolean(selector.title);
}

async function loadProduct(selector: ProductSelector): Promise<LoadedProduct> {
  if (!validSelector(selector)) {
    return { ok: false, error: failure("invalid_product_selector", "Provide exactly one of productId or title.") };
  }

  try {
    const product = await findWarlockProduct(selector);
    if (!product) {
      return { ok: false, error: failure("product_not_found", "No canonical Spellmark product matched that selector.") };
    }
    return { ok: true, product };
  } catch (error) {
    if (error instanceof Error && error.message === "warlock_product_title_ambiguous") {
      return {
        ok: false,
        error: failure("product_title_ambiguous", "More than one product has that title. Use productId instead."),
      };
    }
    console.error("Warlock MCP product lookup failed", error);
    return { ok: false, error: failure("warlock_lookup_failed", "Warlock could not load the canonical product.") };
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
      inputSchema: selectorShape,
      annotations,
    },
    async (selector) => {
      const loaded = await loadProduct(selector);
      if (!loaded.ok) return loaded.error;
      return success({ product: loaded.product });
    },
  );

  server.registerTool(
    "validate_product_package",
    {
      title: "Validate Product Package",
      description: "Validate a canonical product package before any Etsy or Printful write action is allowed.",
      inputSchema: selectorShape,
      annotations,
    },
    async (selector) => {
      const loaded = await loadProduct(selector);
      if (!loaded.ok) return loaded.error;
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
      inputSchema: selectorShape,
      annotations,
    },
    async (selector) => {
      const loaded = await loadProduct(selector);
      if (!loaded.ok) return loaded.error;
      return success(buildWarlockDryRun(loaded.product));
    },
  );


  server.registerTool(
    "evaluate_commerce_gates",
    {
      title: "Evaluate Commerce Gates",
      description: "Evaluate Etsy disclosure compliance, estimated contribution margin, quote freshness, and required Printful mappings without modifying any external system.",
      inputSchema: selectorShape,
      annotations,
    },
    async (selector) => {
      const loaded = await loadProduct(selector);
      if (!loaded.ok) return loaded.error;
      return success({
        productId: loaded.product.id,
        title: loaded.product.title,
        gates: evaluateCommerceGates(loaded.product),
      });
    },
  );

  server.registerTool(
    "preflight_supplier",
    {
      title: "Preflight Printful Supplier",
      description: "Perform live read-only Printful checks for mapped physical variants, store access, catalog identity, and North America availability.",
      inputSchema: selectorShape,
      annotations: liveReadAnnotations,
    },
    async (selector) => {
      const loaded = await loadProduct(selector);
      if (!loaded.ok) return loaded.error;
      const gates = evaluateCommerceGates(loaded.product);
      const supplier = await runPrintfulSupplierPreflight(loaded.product);
      return success({
        productId: loaded.product.id,
        title: loaded.product.title,
        gates,
        supplier,
        readyForWritePhase: gates.pass && supplier.pass,
      });
    },
  );

  server.registerTool(
    "get_production_status",
    {
      title: "Get Product Production Status",
      description: "Summarize canonical fulfillment mappings and readiness without contacting or modifying Etsy or Printful.",
      inputSchema: selectorShape,
      annotations,
    },
    async (selector) => {
      const loaded = await loadProduct(selector);
      if (!loaded.ok) return loaded.error;
      const validation = validateWarlockManifest(loaded.product);
      const gates = evaluateCommerceGates(loaded.product);
      const physical = loaded.product.variants.filter((variant) => variant.fulfillment === "PHYSICAL");
      const digital = loaded.product.variants.filter((variant) => variant.fulfillment === "DIGITAL");
      return success({
        productId: loaded.product.id,
        title: loaded.product.title,
        status: loaded.product.status,
        readyToExecute: validation.ready && gates.pass,
        commerceGates: gates,
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
