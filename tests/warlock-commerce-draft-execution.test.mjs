import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildPhysicalInventoryBody,
  etsySkuForVariant,
} from "../lib/warlock-commerce/etsy-inventory.ts";
import {
  commerceWriteMode,
  publishingEnabled,
} from "../lib/warlock-commerce/write-guard.ts";

const source = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

const physicalListing = {
  id: "listing-physical",
  fulfillment: "PHYSICAL",
  title: "Test",
  description: "Test",
  tagsJson: "[]",
  taxonomyId: 1,
  shippingProfileId: 2,
  readinessStateId: 3,
  quantity: 999,
  whoMade: "i_did",
  whenMade: "2020_2026",
  isSupply: false,
  shouldAutoRenew: true,
  etsyListingId: null,
  printfulSyncProductId: null,
  lastDraftSyncAt: null,
  status: "READY",
  assets: [],
};

const variants = [
  {
    id: "variant-one-0000001",
    fulfillment: "PHYSICAL",
    label: "8×10 unframed",
    printfulProductId: 1,
    printfulVariantId: 4463,
    printfulStoreId: 99,
    etsyListingId: null,
    etsySku: "SM-TEST-8X10",
    etsyProductId: null,
    printfulSyncVariantId: null,
    retailPriceCents: 2400,
    productionBaseCents: 700,
    productionQuotedAt: new Date(),
    currency: "USD",
  },
  {
    id: "variant-two-0000002",
    fulfillment: "PHYSICAL",
    label: "11×14 framed",
    printfulProductId: 2,
    printfulVariantId: 14292,
    printfulStoreId: 99,
    etsyListingId: null,
    etsySku: null,
    etsyProductId: null,
    printfulSyncVariantId: null,
    retailPriceCents: 6900,
    productionBaseCents: 3000,
    productionQuotedAt: new Date(),
    currency: "USD",
  },
];

test("Etsy inventory builder sends the complete physical variant set", () => {
  const body = buildPhysicalInventoryBody(physicalListing, variants);
  assert.equal(body.products.length, 2);
  assert.deepEqual(body.price_on_property, [513]);
  assert.deepEqual(body.sku_on_property, [513]);
  assert.equal(body.products[0].sku, "SM-TEST-8X10");
  assert.equal(body.products[0].offerings[0].price, "24.00");
  assert.equal(body.products[1].offerings[0].price, "69.00");
  assert.equal(body.products[1].property_values[0].values[0], "11×14 framed");
});

test("generated Etsy SKU is stable while preserving explicit canonical SKUs", () => {
  assert.equal(etsySkuForVariant(variants[0]), "SM-TEST-8X10");
  const first = etsySkuForVariant(variants[1]);
  const second = etsySkuForVariant(variants[1]);
  assert.equal(first, second);
  assert.match(first, /^SM-[A-Z0-9]+$/);
  assert.ok(first.length <= 32);
});

test("draft writes remain fail-closed and publishing remains impossible", () => {
  const previous = process.env.WARLOCK_COMMERCE_WRITE_MODE;
  delete process.env.WARLOCK_COMMERCE_WRITE_MODE;
  assert.equal(commerceWriteMode(), "disabled");
  assert.equal(publishingEnabled(), false);
  if (previous === undefined) delete process.env.WARLOCK_COMMERCE_WRITE_MODE;
  else process.env.WARLOCK_COMMERCE_WRITE_MODE = previous;
});

test("Etsy executor is create-or-update draft only and tracks remote asset IDs", () => {
  const etsy = source("lib/warlock-commerce/etsy-draft-executor.ts");
  assert.match(etsy, /etsy_listing_not_draft/);
  assert.match(etsy, /method:\s*"PATCH"/);
  assert.match(etsy, /method:\s*"POST"/);
  assert.match(etsy, /method:\s*"PUT"/);
  assert.match(etsy, /etsyRemoteId/);
  assert.doesNotMatch(etsy, /state[^\n]*active|publishListing|activate/i);
});

test("Printful executor updates imported ecommerce sync variants and never creates orders", () => {
  const printful = source("lib/warlock-commerce/printful-sync-executor.ts");
  assert.match(printful, /\/sync\/products\/@/);
  assert.match(printful, /\/sync\/variant\//);
  assert.match(printful, /method:\s*"PUT"/);
  assert.match(printful, /WAITING_PRINTFUL_IMPORT/);
  assert.doesNotMatch(printful, /\/orders|confirm.*order|submit.*order/i);
});

test("orchestrator checks gates and supplier preflight before Etsy mutation", () => {
  const execution = source("lib/warlock-commerce/draft-execution.ts");
  const gatesAt = execution.indexOf("evaluateCommerceGates");
  const supplierAt = execution.lastIndexOf("runPrintfulSupplierPreflight");
  const etsyAt = execution.lastIndexOf("executeEtsyDrafts");
  assert.ok(gatesAt >= 0);
  assert.ok(supplierAt > gatesAt);
  assert.ok(etsyAt > supplierAt);
  assert.match(execution, /READY_FOR_HUMAN_REVIEW/);
});

test("MCP draft execution requires explicit confirmation and is idempotent but not read-only", () => {
  const server = source("lib/warlock-mcp/server.ts");
  assert.match(server, /"execute_draft_product"/);
  assert.match(server, /confirmDraftWrite:\s*z\.literal\(true\)/);
  assert.match(server, /readOnlyHint:\s*false/);
  assert.match(server, /idempotentHint:\s*true/);
});

test("v5 schema stores Etsy, Printful, and asset sync identifiers", () => {
  const schema = source("prisma/schema.prisma");
  for (const field of [
    "etsySku",
    "etsyProductId",
    "printfulSyncVariantId",
    "printfulSyncProductId",
    "etsyRemoteId",
    "etsySyncedAt",
  ]) {
    assert.match(schema, new RegExp(field));
  }
});

test("Volans migration preserves established SKUs and keeps digital physical-mockup-free", () => {
  const migration = source("prisma/migrations/20260926001500_spellmark_draft_execution_ids/migration.sql");
  assert.match(migration, /SM-OWL-P1-V4463/);
  assert.match(migration, /SM-OWL-P1-V14125/);
  assert.match(migration, /SM-OWL-P2-V14292/);
  assert.match(migration, /Digital: listing hero imagery only/);
  assert.match(migration, /a\."role" = 'customer_file'/);
});
