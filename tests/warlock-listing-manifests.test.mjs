import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readListingAssets, readListingManifest } from "../lib/warlock-listings.ts";

const source = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("listing manifest validates physical and digital Etsy configuration", () => {
  const physical = readListingManifest({
    fulfillment: "PHYSICAL",
    title: "Volans physical",
    description: "Listing copy",
    tags: ["barn owl print"],
    taxonomyId: 123,
    shippingProfileId: 456,
    readinessStateId: 789,
    quantity: 999,
    whoMade: "i_did",
    whenMade: "2020_2026",
    status: "READY",
  });
  assert.equal(physical?.fulfillment, "PHYSICAL");
  assert.equal(physical?.shippingProfileId, 456);

  assert.equal(readListingManifest({
    fulfillment: "DIGITAL",
    title: "Volans Aethereus — Digital Version",
    description: "Digital copy",
    tags: [],
    taxonomyId: 123,
    shippingProfileId: 456,
  }), null, "digital listings cannot carry physical shipping profiles");
});

test("listing asset map preserves order and rejects duplicate asset assignments", () => {
  assert.deepEqual(readListingAssets([
    { assetId: "asset00000000001", kind: "image", position: 2 },
    { assetId: "asset00000000002", kind: "image", position: 1 },
  ]), [
    { assetId: "asset00000000002", kind: "image", position: 1 },
    { assetId: "asset00000000001", kind: "image", position: 2 },
  ]);

  assert.equal(readListingAssets([
    { assetId: "asset00000000001", kind: "image", position: 1 },
    { assetId: "asset00000000001", kind: "customer_file", position: 1 },
  ]), null);
});

test("Prisma schema owns one physical and one digital listing per product with ordered asset links", () => {
  const schema = source("prisma/schema.prisma");
  assert.match(schema, /model SpellmarkListing \{/);
  assert.match(schema, /@@unique\(\[productId, fulfillment\]\)/);
  assert.match(schema, /model SpellmarkListingAsset \{/);
  assert.match(schema, /@@unique\(\[listingId, kind, position\]\)/);
});

test("listing manifest API upserts canonical config and never creates Etsy listings", () => {
  const route = source("app/api/warlock/products/[id]/listings/route.ts");
  assert.match(route, /spellmarkListing\.upsert/);
  assert.match(route, /spellmarkListingAsset\.createMany/);
  assert.match(route, /listing_asset_not_owned_by_product/);
  assert.doesNotMatch(route, /api\.etsy\.com|method:\s*["']POST["']/i);
});

test("Volans migration preserves verified listing identity without inventing Etsy profile IDs", () => {
  const migration = source("prisma/migrations/20260925220000_spellmark_listing_manifests/migration.sql");
  assert.match(migration, /VOLANS AETHEREUS — The Sky Wanderer/);
  assert.match(migration, /Volans Aethereus — Digital Version/);
  assert.match(migration, /shippingProfileId/);
  assert.doesNotMatch(migration, /"shippingProfileId"[^\n]*VALUES/i);
});

test("MCP repository loads canonical listing manifests and assigned assets", () => {
  const repository = source("lib/warlock-mcp/repository.ts");
  assert.match(repository, /listings:\s*\{/);
  assert.match(repository, /readinessStateId:\s*true/);
  assert.match(repository, /assets:\s*\{/);
});


test("listing manifest lifecycle accepts the Printful-import waiting state", () => {
  const waiting = readListingManifest({
    fulfillment: "PHYSICAL",
    title: "Waiting product",
    description: "Approved listing copy",
    tags: [],
    taxonomyId: 123,
    shippingProfileId: 456,
    readinessStateId: 789,
    quantity: 999,
    whoMade: "i_did",
    whenMade: "2020_2026",
    status: "WAITING_PRINTFUL",
  });
  assert.equal(waiting?.status, "WAITING_PRINTFUL");
});
