import { placementShape } from "../warlock-commerce/printful-placements";
import { PrintfulSyncConfigurationError } from "../warlock-commerce/printful-sync-configuration";
import { previewPrintfulPlacements, applyPrintfulPlacements } from "../warlock-commerce/printful-placement-executor";
import { inspectEtsyVariantPrices, updateEtsyVariantPrices } from "../warlock-commerce/live-price-executor";
import { livePriceInspectionShape, livePriceUpdateShape } from "../warlock-commerce/live-price-schema";
import { safeLivePriceError } from "../warlock-commerce/live-prices";
import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { buildWarlockDryRun, validateWarlockManifest } from "./manifest";
import type { WarlockProductManifest } from "./manifest";
import { findWarlockProduct } from "./repository";
import { evaluateCommerceGates } from "../warlock-commerce/gates";
import { runPrintfulSupplierPreflight } from "../warlock-commerce/printful-preflight";
import { buildCommerceExecutionPlan } from "../warlock-commerce/execution-plan";
import { reconcilePrintfulProduct } from "../warlock-commerce/printful-reconciliation-executor";
import { inspectPrintfulProduction } from "../warlock-commerce/printful-inspection";
import { executeDraftProduct } from "../warlock-commerce/draft-execution";
import { commerceWriteMode } from "../warlock-commerce/write-guard";
import { WARLOCK_TOOL_SECURITY_SCHEMES } from "../warlock-mcp-oauth";
import { inspectEtsyConfiguration } from "../warlock-commerce/etsy-config-inspector";
import { applyVerifiedEtsyConfiguration } from "../warlock-commerce/etsy-config-writer";
import { prisma } from "../prisma";
import { intakeProduct } from "../warlock-intake";
import { intakeProductShape } from "../warlock-intake-schema";
import { searchPrintfulCatalog, resolvePrintfulCatalog, safePrintfulError } from "../warlock-commerce/printful-catalog";
import { updateProductPrices, productPricesShape, safeProductPriceError } from "../warlock-commerce/product-prices";
import { configurePrintfulVariant } from "../warlock-commerce/printful-configuration";
import { attachProductFileShape, attachmentIntake } from "../warlock-attachment";

import { getProductBookkeeping, recordProductNote, reconcileEtsyListing, bookkeepingReadShape, productNoteShape, listingReconciliationShape, safeBookkeepingError } from "../warlock-commerce/bookkeeping";

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

const draftWriteAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

const draftExecutionShape = {
  ...selectorShape,
  confirmDraftWrite: z.literal(true),
};

const etsyConfigShape = {
  ...selectorShape,
  taxonomyQuery: z.string().trim().min(2).max(120).optional(),
};

const verifiedEtsyConfigShape = {
  ...selectorShape,
  fulfillment: z.enum(["DIGITAL", "PHYSICAL"]),
  taxonomyId: z.number().int().positive(),
  shippingProfileId: z.string().trim().regex(/^[1-9]\d{0,18}$/).optional(),
  readinessStateId: z.string().trim().regex(/^[1-9]\d{0,18}$/).optional(),
  confirmConfiguration: z.literal(true),
};

const configurationWriteAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

const intakeAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;


function success(payload: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  };
}

function failure(code: string, message: string, details: Record<string,unknown> = {}) {
  console.warn("Warlock tool failed", {code});
  const payload = {error:code,message,...details};
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: JSON.stringify(payload) }],
    structuredContent: payload,
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
    version: "0.8.0",
  });

  server.registerTool(
    "get_product_bookkeeping",
    { title: "Read Stored Product Ledger", description: "Read stored catalog state, latest verified Etsy observations, discrepancies and paginated notes/history. Omit productId for the catalog overview. Evidence includes timestamps; do not reconstruct mutable state from chat memory. Does not contact Etsy.", inputSchema: bookkeepingReadShape, annotations: annotations,
      _meta: { securitySchemes: WARLOCK_TOOL_SECURITY_SCHEMES } },
    async input => { try { return success(await getProductBookkeeping(input)); } catch(error) { return failure("bookkeeping_failed", safeBookkeepingError(error)); } },
  );
  server.registerTool(
    "record_product_note",
    { title: "Record Product Production Note", description: "Append a durable production or clerical note without replacing existing notes or asserting live facts. Use a stable requestId for safe retries; reusing it with different content fails. Does not change listings, prices, workflow stages or orders.", inputSchema: productNoteShape, annotations: { ...annotations, readOnlyHint: false },
      _meta: { securitySchemes: WARLOCK_TOOL_SECURITY_SCHEMES } },
    async input => { try { return success(await recordProductNote(input)); } catch(error) { return failure("bookkeeping_failed", safeBookkeepingError(error)); } },
  );
  server.registerTool(
    "reconcile_etsy_listing",
    { title: "Verify Existing Etsy Listing Records", description: "Read an already-saved Etsy listing, including active digital listings, and store observed state, prices, images/files and discrepancies in Warlock. Requires the expected saved Etsy listing ID. Optional assetMappings explicitly associates reviewed canonical links with observed remote IDs; never guess artwork identity from rank or filename. Preserves draft workflow status and canonical pricing; no Etsy mutations, recreation, redrafting, publishing or orders. Physical supplier verification remains separate.", inputSchema: listingReconciliationShape, annotations: draftWriteAnnotations,
      _meta: { securitySchemes: WARLOCK_TOOL_SECURITY_SCHEMES } },
    async input => { try { return success(await reconcileEtsyListing(input)); } catch(error) { return failure("bookkeeping_failed", safeBookkeepingError(error)); } },
  );

  server.registerTool(
    "intake_product",
    {
      title: "Create or Complete Spellmark Product",
      description: "Create or complete a canonical product by productId or unambiguous title. Persist listings, per-variant USD prices, production quotes, and real private assets from owned Warlock assetId, native ChatGPT files (files plus assets.fileId), approved HTTPS downloads, or small base64 files. Retries preserve IDs and avoid duplicates. Set digitalDelivery to MADE_TO_ORDER for custom digital work delivered after purchase, or INSTANT_DOWNLOAD for ready downloads. Use listings for both fulfillment types and retailPriceCents per edition. Intake locks after draft execution; use update_product_prices for later canonical retail-price edits. Intake remains CONFIG until live Etsy configuration verification. Does not write Etsy, publish, or place orders.",
      inputSchema: intakeProductShape,
      annotations: intakeAnnotations,
      _meta: { securitySchemes: WARLOCK_TOOL_SECURITY_SCHEMES, "openai/fileParams": ["files"] },
    },
    async (input) => {
      try {
        const result = await intakeProduct(input, prisma);
        const canonical = await findWarlockProduct({ productId: result.productId });
        return success({ ...result, validation: canonical ? validateWarlockManifest(canonical) : null,
          gates: canonical ? evaluateCommerceGates(canonical) : null });
      } catch (error) {
        // Do not expose/log signed asset URLs or input package bytes.
        return failure("warlock_intake_failed", error instanceof Error && error.message === "intake_locked_after_draft_execution" ? "intake_locked_after_draft_execution: Use update_product_prices for confirmed canonical retail-price edits; existing Etsy prices are updated separately." : error instanceof Error && !error.message.includes("https:") ? error.message : "Warlock intake failed; retry the same package after checking its assets.");
      }
    },
  );

  server.registerTool(
    "attach_product_file",
    {
      title: "Attach ChatGPT File to Spellmark Product",
      description: "Attach one selected ChatGPT image or customer file to an existing canonical product. Prefer this tool for native attachments after intake_product creates the product. Supply the attachment through the native file parameter; ChatGPT resolves its ID to downloadable bytes. Specify master, hero, mockup, customer_file or other and optional fulfillment and rank. Repeat for each file. Retries reuse stored assets and links. Returns package validation. Preserves product, prices, variants and verified Etsy configuration. Does not create Etsy drafts, publish or order fulfillment.",
      inputSchema: attachProductFileShape,
      annotations: intakeAnnotations,
      _meta: { securitySchemes: WARLOCK_TOOL_SECURITY_SCHEMES, "openai/fileParams": ["file"] },
    },
    async (input) => {
      const loaded = await loadProduct({ productId: input.productId });
      if (!loaded.ok) return loaded.error;
      try {
        const result = await intakeProduct(attachmentIntake(input, loaded.product), prisma);
        const canonical = await findWarlockProduct({ productId: result.productId });
        return success({ ...result, validation: canonical ? validateWarlockManifest(canonical) : null,
          gates: canonical ? evaluateCommerceGates(canonical) : null });
      } catch (error) {
        return failure("warlock_attachment_failed", error instanceof Error && !error.message.includes("https:") ? error.message : "Warlock attachment failed; select the file again for a fresh authorized download URL.");
      }
    },
  );

  server.registerTool(
    "search_printful_catalog",
    {
      title: "Find Printful Blank Products",
      description: "Search the live Printful catalog by title, brand, model or type. Omit storeId to discover accessible stores first. Returns product IDs and images with pagination. Discovery may use a five-minute cache; never treat this as a quote. Read-only. Use resolve_printful_catalog next.",
      inputSchema: { storeId:z.number().int().positive().max(2147483647).optional(), query:z.string().trim().min(1).max(120), offset:z.number().int().min(0).max(10000).optional(), limit:z.number().int().min(1).max(50).optional() },
      annotations: liveReadAnnotations,
      _meta: { securitySchemes: WARLOCK_TOOL_SECURITY_SCHEMES },
    },
    async input => { try { return success(await searchPrintfulCatalog(input)); } catch(error) { return failure("printful_catalog_failed", safePrintfulError(error)); } },
  );
  server.registerTool(
    "resolve_printful_catalog",
    {
      title: "Resolve Printful Sizes and Colors",
      description: "Read exact catalog variant IDs for a product, optionally filtering exact colors and sizes. Returns supported techniques, file placements and options for inspection. Does not save mappings or quote final costs. Never guess IDs. Configure the chosen existing canonical variant with configure_printful_variant.",
      inputSchema: { storeId:z.number().int().positive().max(2147483647), productId:z.number().int().positive().max(2147483647), colors:z.array(z.string().min(1).max(80)).max(30).optional(), sizes:z.array(z.string().min(1).max(80)).max(30).optional() },
      annotations: liveReadAnnotations,
      _meta: { securitySchemes: WARLOCK_TOOL_SECURITY_SCHEMES },
    },
    async input => { try { return success(await resolvePrintfulCatalog(input)); } catch(error) { return failure("printful_catalog_failed", safePrintfulError(error)); } },
  );
  server.registerTool(
    "configure_printful_variant",
    {
      title: "Save Verified Printful Variant and Quote",
      description: "Save a selected exact catalog mapping and fresh API production quote to an existing PHYSICAL Warlock variant. Takes canonical productId/variantId and Printful catalogProductId/catalogVariantId/storeId. Requires confirmation. Preserves approved retail price and Etsy configuration. New imports use one default non-embroidery print file. Existing saved sync variants are quoted using their actual configured files, including standard DTG front/back/sleeve stacks; unsupported options or ambiguous fees block refresh and preserve saved costs. This tool preserves supplier files and never configures extra placements. Quotes are USD for North America and exclude shipping, tax and order-specific fees. Execution rechecks costs and stock live. Does not write Etsy or Printful, publish or place orders.",
      inputSchema: { productId:z.string().min(1).max(100), variantId:z.string().min(1).max(100), catalogProductId:z.number().int().positive().max(2147483647), catalogVariantId:z.number().int().positive().max(2147483647), storeId:z.number().int().positive().max(2147483647), confirmConfiguration:z.literal(true) },
      annotations: configurationWriteAnnotations,
      _meta: { securitySchemes: WARLOCK_TOOL_SECURITY_SCHEMES },
    },
    async input => { try {
      const configured=await configurePrintfulVariant(input,prisma);
      const canonical=await findWarlockProduct({productId:input.productId});
      return success({...configured,gates:canonical?evaluateCommerceGates(canonical):null});
    } catch(error) { return failure("printful_configuration_failed", safePrintfulError(error)); } },
  );

  server.registerTool(
    "update_product_prices",
    {
      title: "Update Existing Warlock Retail Prices",
      description: "Save confirmed USD retail-price changes for owned canonical variants, including after Etsy draft creation or publication. First get_product to obtain productId, variantId and current retailPriceCents. Supply prices with expectedRetailPriceCents and the approved new retailPriceCents, in integer cents, plus confirmPrices:true. All selected prices update atomically; conflicting current prices block the batch and exact retries are safe. This is the post-draft canonical price-edit path: do not use intake_product. Preserves supplier quotes, assets, variant mappings, listing IDs and status. Does not change Etsy or Printful retail prices, publish, place orders or recreate listings. Use inspect_etsy_variant_prices and separately confirmed update_etsy_variant_prices to apply and verify existing Etsy/Printful retail prices, then reconcile if needed.",
      inputSchema: productPricesShape,
      annotations: { ...annotations, readOnlyHint:false },
      _meta: { securitySchemes: WARLOCK_TOOL_SECURITY_SCHEMES },
    },
    async input => {
      try { return success(await updateProductPrices(input,prisma)); }
      catch(error){ return failure("warlock_price_update_failed",safeProductPriceError(error)); }
    },
  );

  server.registerTool(
    "inspect_etsy_variant_prices",
    {
      title: "Inspect Live Etsy and Printful Retail Prices",
      description: "Read the owned active physical Etsy listing's exact variant IDs/SKUs, USD retail prices and complete inventory fingerprint, plus the mapped configured Printful retail prices. Returns current expected values for update_etsy_variant_prices. Requires already-saved Etsy product and Printful sync IDs. Read-only; never refreshes or recreates imports. Digital and draft listings are outside this tool's current scope.",
      inputSchema: livePriceInspectionShape,
      annotations: liveReadAnnotations,
      _meta: { securitySchemes: WARLOCK_TOOL_SECURITY_SCHEMES },
    },
    async input=>{try{return success(await inspectEtsyVariantPrices(input.productId));}catch(error){return failure("live_price_inspection_failed",safeLivePriceError(error));}},
  );
  server.registerTool(
    "update_etsy_variant_prices",
    {
      title: "Update and Verify Live Variation Retail Prices",
      description: "Confirmed price-only changes for an owned already-active physical Etsy listing, followed by a retail_price-only mirror to its configured Printful variants. First save approved Warlock targets with update_product_prices, then inspect_etsy_variant_prices. Supply its expectedInventoryFingerprint and up to six selected variantId/expectedEtsyPriceCents/expectedPrintfulRetailPriceCents/retailPriceCents entries, plus confirmLivePriceWrite:true. Targets must match canonical prices; current supplier costs and margins are checked. Re-reads ownership, active state, IDs/SKUs, prices, inventory and supplier file configuration before writing; preserves the current inventory's quantities, enabled flags, property values and processing profiles. Verifies Etsy after writing and Printful after each retail mirror. No publishing, re-drafting, asset upload, order creation or mapping changes. Etsy is the storefront price source. External edits are not atomic across providers: partial/uncertain completion returns VERIFY_OR_RETRY_REQUIRED; inspect before retrying. The full-inventory write is not atomic with the preceding GET; avoid simultaneous manual inventory edits. Requires existing commerce write mode draft; this is a narrowly confirmed price-only exception to active-listing protection.",
      inputSchema: livePriceUpdateShape,
      annotations: draftWriteAnnotations,
      _meta: { securitySchemes: WARLOCK_TOOL_SECURITY_SCHEMES },
    },
    async input=>{try{return success(await updateEtsyVariantPrices(input));}catch(error){return failure("live_price_update_failed",safeLivePriceError(error));}},
  );

  server.registerTool(
    "get_product",
    {
      title: "Get Spellmark Product",
      description: "Read one canonical Spellmark product, including its assets, variants, Printful mappings, prices, and Etsy listing IDs.",
      inputSchema: selectorShape,
      annotations,
      _meta: { securitySchemes: WARLOCK_TOOL_SECURITY_SCHEMES },
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
      _meta: { securitySchemes: WARLOCK_TOOL_SECURITY_SCHEMES },
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
      _meta: { securitySchemes: WARLOCK_TOOL_SECURITY_SCHEMES },
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
      _meta: { securitySchemes: WARLOCK_TOOL_SECURITY_SCHEMES },
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
      _meta: { securitySchemes: WARLOCK_TOOL_SECURITY_SCHEMES },
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
    "inspect_etsy_configuration",
    {
      title: "Inspect Etsy Configuration",
      description: "Read the shop's current shipping profiles, processing profiles, existing physical listing metadata, and ranked seller-taxonomy candidates. Never changes Etsy or WizardOS.",
      inputSchema: etsyConfigShape,
      annotations: liveReadAnnotations,
      _meta: { securitySchemes: WARLOCK_TOOL_SECURITY_SCHEMES },
    },
    async (input) => {
      const loaded = await loadProduct(input);
      if (!loaded.ok) return loaded.error;
      try {
        return success(await inspectEtsyConfiguration(loaded.product, input.taxonomyQuery));
      } catch (error) {
        console.error("Warlock MCP Etsy configuration inspection failed", error);
        return failure(
          "etsy_configuration_inspection_failed",
          error instanceof Error ? error.message : "Etsy configuration inspection failed.",
        );
      }
    },
  );

  server.registerTool(
    "configure_etsy_listing",
    {
      title: "Configure Etsy Listing",
      description: "Verify selected Etsy taxonomy and shop profile IDs against live Etsy, then save them to the canonical WizardOS listing only. Does not modify Etsy.",
      inputSchema: verifiedEtsyConfigShape,
      annotations: configurationWriteAnnotations,
      _meta: { securitySchemes: WARLOCK_TOOL_SECURITY_SCHEMES },
    },
    async (input) => {
      const loaded = await loadProduct(input);
      if (!loaded.ok) return loaded.error;

      if (
        input.fulfillment === "PHYSICAL" &&
        (!input.shippingProfileId || !input.readinessStateId)
      ) {
        return failure(
          "physical_etsy_configuration_incomplete",
          "Physical listings require both shippingProfileId and readinessStateId.",
        );
      }
      if (
        input.fulfillment === "DIGITAL" &&
        (input.shippingProfileId !== undefined || input.readinessStateId !== undefined)
      ) {
        return failure(
          "digital_etsy_configuration_invalid",
          "Digital listings do not use shipping or readiness profile IDs.",
        );
      }

      try {
        return success(await applyVerifiedEtsyConfiguration(loaded.product, {
          fulfillment: input.fulfillment,
          taxonomyId: input.taxonomyId,
          shippingProfileId: input.shippingProfileId,
          readinessStateId: input.readinessStateId,
        }));
      } catch (error) {
        console.error("Warlock MCP Etsy configuration save failed", error);
        return failure(
          "etsy_configuration_save_failed",
          error instanceof Error ? error.message : "Etsy configuration save failed.",
        );
      }
    },
  );

  server.registerTool(
    "prepare_execution_plan",
    {
      title: "Prepare Commerce Execution Plan",
      description: "Prepare the fail-closed Etsy-first / Printful-sync production sequence. This tool never performs an external mutation.",
      inputSchema: selectorShape,
      annotations,
      _meta: { securitySchemes: WARLOCK_TOOL_SECURITY_SCHEMES },
    },
    async (selector) => {
      const loaded = await loadProduct(selector);
      if (!loaded.ok) return loaded.error;
      return success(buildCommerceExecutionPlan(loaded.product));
    },
  );

  server.registerTool(
    "check_printful_import",
    {
      title: "Check Printful Etsy Import",
      description: "Read the live Printful ecommerce sync feed and inspect every imported variant. Return EMPTY_IMPORT, PROCESSING, CONFIGURED or NEEDS_REVIEW with exact missing or invalid fields, even if other variants fail. Imported IDs alone never prove production readiness. Use this to diagnose incomplete configurations and pending uploads before retrying. Does not modify Etsy or Printful or trigger a store refresh.",
      inputSchema: selectorShape,
      annotations: liveReadAnnotations,
      _meta: { securitySchemes: WARLOCK_TOOL_SECURITY_SCHEMES },
    },
    async (selector) => {
      const loaded = await loadProduct(selector);
      if (!loaded.ok) return loaded.error;
      return success(await inspectPrintfulProduction(loaded.product));
    },
  );

  server.registerTool("preview_printful_placements", {
    title: "Preview Printful Placement Changes",
    description: "Save a reviewable placement preview for every physical variant using explicitly selected, product-owned PNG/JPEG production exports with role master or other and explicit pixel dimensions/positions. Hero, mockup, customer_file and generated production_canvas assets are excluded. Selection does not change an asset role or authorize supplier writes; the exact saved preview still requires owner approval. Reads Etsy ownership/type, imported IDs, supported placements, stock and combined production costs. Bakes the approved position into a transparent PNG at 300 DPI, preserves original assets, and stores the preview in bookkeeping without changing Printful or Etsy. Pixel coordinates must come from approved product print areas; never guess dimensions. Show the complete preview to the owner before applying.",
    inputSchema: placementShape, annotations: configurationWriteAnnotations,
    _meta: { securitySchemes: WARLOCK_TOOL_SECURITY_SCHEMES },
  }, async input => {
    try { return success(await previewPrintfulPlacements(input)); }
    catch (error) { return failure("printful_placement_preview_failed", safePrintfulError(error), error instanceof PrintfulSyncConfigurationError ? {configurationIssues:error.configurationIssues,nextAction:"Inspect every variant with check_printful_import. Wait for processing to finish before creating another preview; no supplier write occurred."} : {}); }
  });
  server.registerTool("apply_printful_placements", {
    title: "Apply Approved Printful Placements",
    description: "Apply an explicitly approved saved placement preview, preserving Etsy inventory and Printful product options. Reject expired or changed previews before writes. Read back file checksums, canvas dimensions, DPI and catalog mapping for every variant, refresh combined costs, and persist verification evidence. Partial failures return NEEDS_REVIEW, never ready. Requires commerce write mode and owner approval of this exact preview. Printful sync does not expose physical offsets: visual mockup review is still required before calling a product ready. Never publishes or orders.",
    inputSchema: { productId: z.string().min(1).max(100), previewId: z.string().min(1).max(100), confirmPlacementWrite: z.literal(true) },
    annotations: draftWriteAnnotations, _meta: { securitySchemes: WARLOCK_TOOL_SECURITY_SCHEMES },
  }, async input => {
    try { return success(await applyPrintfulPlacements(input)); }
    catch (error) { return failure("printful_placement_apply_failed", safePrintfulError(error)); }
  });

  server.registerTool(
    "reconcile_printful_product",
    {
      title: "Reconcile Printful for an Active Etsy Product",
      description: "Complete Printful mapping for a canonical physical Etsy listing already published by the owner. Verify live Etsy ownership, active state, exact inventory IDs/SKUs and unchanged approved prices; refresh supplier costs/stock and gates, persist imported sync IDs, and configure Printful only. Etsy is read-only: no recreation, redrafting, inventory changes, publishing, or orders. Requires explicit reconciliation confirmation and the existing commerce write switch.",
      inputSchema: { ...selectorShape, confirmReconciliation: z.literal(true) },
      annotations: draftWriteAnnotations,
      _meta: { securitySchemes: WARLOCK_TOOL_SECURITY_SCHEMES },
    },
    async (input) => {
      if (commerceWriteMode() !== "draft") return failure("warlock_commerce_writes_disabled", "Confirmed supplier reconciliation requires WARLOCK_COMMERCE_WRITE_MODE=draft.");
      const loaded = await loadProduct(input);
      if (!loaded.ok) return loaded.error;
      try { return success(await reconcilePrintfulProduct(loaded.product.id)); }
      catch { return failure("printful_reconciliation_failed", "Could not load the canonical product or authorized Etsy connection for reconciliation."); }
    },
  );

  server.registerTool(
    "execute_draft_product",
    {
      title: "Execute Draft Product",
      description: "Create or update Etsy drafts and configure imported Printful sync variants after all Warlock gates pass. Never publishes listings or places orders.",
      inputSchema: draftExecutionShape,
      annotations: draftWriteAnnotations,
      _meta: { securitySchemes: WARLOCK_TOOL_SECURITY_SCHEMES },
    },
    async (input) => {
      if (commerceWriteMode() !== "draft") {
        return failure(
          "warlock_commerce_writes_disabled",
          "Draft execution is disabled. WARLOCK_COMMERCE_WRITE_MODE must be explicitly set to draft.",
        );
      }

      const loaded = await loadProduct(input);
      if (!loaded.ok) return loaded.error;

      try {
        return success({ ...(await executeDraftProduct(loaded.product.id)) });
      } catch (error) {
        console.error("Warlock MCP draft execution failed", error);
        return failure(
          "draft_execution_failed",
          error instanceof Error && error.message === "etsy_listing_not_draft" ? "etsy_listing_not_draft: If an Etsy listing is already active, use reconcile_etsy_listing to verify stored Etsy records; use reconcile_printful_product for physical supplier mapping. Both preserve the active listing." : error instanceof Error ? error.message : "Draft execution failed.",
        );
      }
    },
  );

  server.registerTool(
    "get_production_status",
    {
      title: "Get Product Production Status",
      description: "Summarize canonical fulfillment mappings, delivery mode and latest timestamped Etsy observations without contacting or modifying Etsy or Printful. Workflow status is separate from observed live state. Use get_product_bookkeeping for discrepancies and history.",
      inputSchema: selectorShape,
      annotations,
      _meta: { securitySchemes: WARLOCK_TOOL_SECURITY_SCHEMES },
    },
    async (selector) => {
      const loaded = await loadProduct(selector);
      if (!loaded.ok) return loaded.error;
      const validation = validateWarlockManifest(loaded.product);
      const gates = evaluateCommerceGates(loaded.product);
      const physical = loaded.product.variants.filter((variant) => variant.fulfillment === "PHYSICAL");
      const digital = loaded.product.variants.filter((variant) => variant.fulfillment === "DIGITAL");
      const physicalListing = loaded.product.listings.find((listing) => listing.fulfillment === "PHYSICAL") ?? null;
      const digitalListing = loaded.product.listings.find((listing) => listing.fulfillment === "DIGITAL") ?? null;
      return success({
        productId: loaded.product.id,
        title: loaded.product.title,
        status: loaded.product.status,
        readyToExecute: validation.ready && gates.pass,
        commerceGates: gates,
        physical: {
          variants: physical.length,
          mappedToPrintful: physical.filter((variant) => variant.printfulVariantId && variant.printfulStoreId).length,
          listingManifest: physicalListing ? {
            id: physicalListing.id,
            title: physicalListing.title,
            status: physicalListing.status,
            lastVerifiedAt: physicalListing.lastVerifiedAt ?? null,
            observation: physicalListing.observationJson ? JSON.parse(physicalListing.observationJson) : null,
            etsyListingId: physicalListing.etsyListingId,
            imageCount: physicalListing.assets.filter((asset) => asset.kind === "image").length,
          } : null,
        },
        digital: {
          variants: digital.length,
          listingManifest: digitalListing ? {
            id: digitalListing.id,
            title: digitalListing.title,
            status: digitalListing.status,
            digitalDelivery: digitalListing.digitalDelivery ?? "INSTANT_DOWNLOAD",
            lastVerifiedAt: digitalListing.lastVerifiedAt ?? null,
            observation: digitalListing.observationJson ? JSON.parse(digitalListing.observationJson) : null,
            etsyListingId: digitalListing.etsyListingId,
            imageCount: digitalListing.assets.filter((asset) => asset.kind === "image").length,
            customerFileCount: digitalListing.assets.filter((asset) => asset.kind === "customer_file").length,
          } : null,
        },
        validation,
      });
    },
  );

  return server;
}
