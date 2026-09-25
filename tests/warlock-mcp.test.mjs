import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildWarlockDryRun, validateWarlockManifest } from "../lib/warlock-mcp/manifest.ts";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const readyManifest = {
  id: "spellmark-volans",
  title: "VOLANS AETHEREUS — The Sky Wanderer",
  collection: "Cabinet of Curiosities",
  description: "Approved product.",
  artworkReference: "volans-master",
  status: "READY",
  notes: "",
  assets: [
    { id: "a1", role: "master", fileName: "master.png", blobUrl: "https://example.test/master.png", pathname: "master.png", contentType: "image/png", byteSize: 100 },
    { id: "a2", role: "hero", fileName: "hero.jpg", blobUrl: "https://example.test/hero.jpg", pathname: "hero.jpg", contentType: "image/jpeg", byteSize: 100 },
    { id: "a3", role: "mockup", fileName: "mock.jpg", blobUrl: "https://example.test/mock.jpg", pathname: "mock.jpg", contentType: "image/jpeg", byteSize: 100 },
    { id: "a4", role: "customer_file", fileName: "digital.zip", blobUrl: "https://example.test/digital.zip", pathname: "digital.zip", contentType: "application/zip", byteSize: 100 },
  ],
  variants: [
    { id: "v1", fulfillment: "PHYSICAL", label: "8×10", printfulProductId: 1, printfulVariantId: 4463, printfulStoreId: 4999878, etsyListingId: null, retailPriceCents: 2400, productionBaseCents: null, currency: "USD" },
    { id: "v2", fulfillment: "DIGITAL", label: "Digital Version", printfulProductId: null, printfulVariantId: null, printfulStoreId: null, etsyListingId: null, retailPriceCents: 900, productionBaseCents: null, currency: "USD" },
  ],
};

test("Warlock MCP manifest validation gates incomplete product packages", () => {
  assert.equal(validateWarlockManifest(readyManifest).ready, true);
  const broken = {
    ...readyManifest,
    assets: readyManifest.assets.filter((asset) => asset.role !== "master"),
  };
  const result = validateWarlockManifest(broken);
  assert.equal(result.ready, false);
  assert.ok(result.errors.some((entry) => entry.code === "master_missing"));
});

test("Warlock MCP dry run describes writes without performing them", () => {
  const plan = buildWarlockDryRun(readyManifest);
  assert.equal(plan.mode, "DRY_RUN");
  assert.equal(plan.readyToExecute, true);
  assert.ok(plan.steps.some((step) => step.system === "Printful" && step.mode === "PLANNED_WRITE"));
  assert.ok(plan.steps.some((step) => step.system === "Etsy" && step.mode === "PLANNED_WRITE"));
});

test("remote MCP endpoint is disabled by default and requires the Warlock operator key", () => {
  const route = source("app/api/warlock/mcp/route.ts");
  assert.match(route, /WARLOCK_MCP_ENABLED/);
  assert.match(route, /isWarlockOperatorRequest/);
  assert.match(route, /WARLOCK_OPERATOR_HEADER/);
  assert.match(route, /handler\.fetch\(request\)/);
});

test("v1 MCP surface exposes only read and dry-run commerce tools", () => {
  const server = source("lib/warlock-mcp/server.ts");
  for (const tool of ["get_product", "validate_product_package", "dry_run_product", "get_production_status"]) {
    assert.match(server, new RegExp(`"${tool}"`));
  }
  assert.match(server, /readOnlyHint: true/);
  assert.doesNotMatch(server, /create.*listing|upload.*file|method:\s*["']POST["']/i);
});
