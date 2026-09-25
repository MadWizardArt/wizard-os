import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { selectPhysicalExecutionStrategy } from "../lib/warlock-commerce/strategy.ts";
import {
  commerceWriteMode,
  publishingEnabled,
} from "../lib/warlock-commerce/write-guard.ts";
import { buildCommerceExecutionPlan } from "../lib/warlock-commerce/execution-plan.ts";

const source = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

const manifest = {
  id: "product-1",
  title: "Test Product",
  collection: "Spellmark",
  description: "Created using a combination of original art direction, digital design, and AI-assisted image-making.",
  artworkReference: "master",
  status: "READY",
  notes: "",
  assets: [
    { id: "a1", role: "master", fileName: "master.png", blobUrl: "https://private.test/master.png", pathname: "masters/master.png", contentType: "image/png", byteSize: 100 },
    { id: "a2", role: "hero", fileName: "hero.jpg", blobUrl: "https://private.test/hero.jpg", pathname: "listing/hero.jpg", contentType: "image/jpeg", byteSize: 100 },
    { id: "a3", role: "mockup", fileName: "mock.jpg", blobUrl: "https://private.test/mock.jpg", pathname: "listing/mock.jpg", contentType: "image/jpeg", byteSize: 100 },
  ],
  variants: [
    { id: "v1", fulfillment: "PHYSICAL", label: "8x10", printfulProductId: 1, printfulVariantId: 4463, printfulStoreId: 99, etsyListingId: null, retailPriceCents: 2400, productionBaseCents: 700, productionQuotedAt: new Date(), currency: "USD" },
    { id: "v2", fulfillment: "PHYSICAL", label: "11x14 framed", printfulProductId: 2, printfulVariantId: 14292, printfulStoreId: 99, etsyListingId: null, retailPriceCents: 6900, productionBaseCents: 3000, productionQuotedAt: new Date(), currency: "USD" },
  ],
};

test("physical API automation is Etsy-first then Printful ecommerce sync", () => {
  const strategy = selectPhysicalExecutionStrategy(manifest);
  assert.equal(strategy.strategy, "ETSY_FIRST_PRINTFUL_SYNC");
  assert.equal(strategy.mixedCatalogProducts, true);
  assert.deepEqual(strategy.catalogProductIds, [1, 2]);
});

test("commerce writes fail closed and publishing is not automatable", () => {
  const previous = process.env.WARLOCK_COMMERCE_WRITE_MODE;
  delete process.env.WARLOCK_COMMERCE_WRITE_MODE;
  assert.equal(commerceWriteMode(), "disabled");
  assert.equal(publishingEnabled(), false);
  if (previous === undefined) delete process.env.WARLOCK_COMMERCE_WRITE_MODE;
  else process.env.WARLOCK_COMMERCE_WRITE_MODE = previous;
});

test("execution plan disables external mutations when draft writes are disabled", () => {
  const previous = process.env.WARLOCK_COMMERCE_WRITE_MODE;
  delete process.env.WARLOCK_COMMERCE_WRITE_MODE;
  const plan = buildCommerceExecutionPlan(manifest);
  assert.equal(plan.writeMode, "disabled");
  assert.equal(plan.publishAutomation, false);
  assert.equal(plan.physicalStrategy.strategy, "ETSY_FIRST_PRINTFUL_SYNC");
  assert.ok(plan.steps.filter((step) => step.externalMutation).every((step) => step.enabled === false));
  assert.match(plan.steps.at(-1).action, /human review/i);
  if (previous === undefined) delete process.env.WARLOCK_COMMERCE_WRITE_MODE;
  else process.env.WARLOCK_COMMERCE_WRITE_MODE = previous;
});

test("temporary Printful file delivery uses private Vercel Blob signed URLs", () => {
  const assetDelivery = source("lib/warlock-commerce/asset-delivery.ts");
  assert.match(assetDelivery, /issueSignedToken/);
  assert.match(assetDelivery, /presignUrl/);
  assert.match(assetDelivery, /access:\s*"private"/);
  assert.match(assetDelivery, /operations:\s*\["get"\]/);
});

test("MCP exposes execution planning as a read-only tool", () => {
  const server = source("lib/warlock-mcp/server.ts");
  assert.match(server, /"prepare_execution_plan"/);
  assert.match(server, /buildCommerceExecutionPlan/);
  assert.match(server, /readOnlyHint:\s*true/);
});

test("write infrastructure contains no automated publish mode", () => {
  const guard = source("lib/warlock-commerce/write-guard.ts");
  assert.doesNotMatch(guard, /CommerceWriteMode[^\n]*publish/i);
  assert.match(guard, /publishingEnabled\(\)/);
  assert.match(guard, /return false as const/);
});
