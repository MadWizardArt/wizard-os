import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ETSY_AI_DISCLOSURE,
  ensureEtsyAiDisclosure,
  estimateEtsyBaseFeesCents,
} from "../lib/warlock-commerce/policy.ts";
import { evaluateCommerceGates } from "../lib/warlock-commerce/gates.ts";

const source = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

const manifest = {
  id: "spellmark-volans",
  title: "VOLANS AETHEREUS — The Sky Wanderer",
  collection: "Cabinet of Curiosities",
  description: "Approved listing copy.",
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
    {
      id: "v1", fulfillment: "PHYSICAL", label: "8×10", printfulProductId: 1,
      printfulVariantId: 4463, printfulStoreId: 4999878, etsyListingId: null,
      retailPriceCents: 2400, productionBaseCents: 1000,
      productionQuotedAt: new Date("2026-09-25T12:00:00Z"), currency: "USD",
    },
    {
      id: "v2", fulfillment: "DIGITAL", label: "Digital Version", printfulProductId: null,
      printfulVariantId: null, printfulStoreId: null, etsyListingId: null,
      retailPriceCents: 900, productionBaseCents: null, productionQuotedAt: null, currency: "USD",
    },
  ],
};

test("Etsy disclosure is appended exactly once", () => {
  const once = ensureEtsyAiDisclosure("Original listing copy.");
  const twice = ensureEtsyAiDisclosure(once);
  assert.equal(once.split(ETSY_AI_DISCLOSURE).length - 1, 1);
  assert.equal(once, twice);
});

test("US base Etsy fee model includes listing, transaction, and payment processing fees", () => {
  assert.equal(estimateEtsyBaseFeesCents(2400), 273);
});

test("commerce gates inject disclosure and pass a healthy priced product", () => {
  const result = evaluateCommerceGates(manifest, new Date("2026-09-25T18:00:00Z"));
  assert.equal(result.pass, true);
  assert.equal(result.compliance.disclosureWillBeApplied, true);
  assert.match(result.compliance.etsyDescription, /AI-assisted image-making/);
  assert.equal(result.margin.variants[0].pass, true);
  assert.equal(result.supplier.liveCheckRequired, true);
});

test("stale Printful cost quotes block the margin gate", () => {
  const result = evaluateCommerceGates(manifest, new Date("2026-10-10T18:00:00Z"));
  assert.equal(result.pass, false);
  assert.ok(result.errors.some((entry) => entry.code === "production_quote_stale"));
});

test("all current Etsy description write paths enforce the disclosure helper", () => {
  for (const path of [
    "app/api/etsy/drafts/route.ts",
    "app/api/etsy/listings/[listingId]/route.ts",
    "app/api/etsy/releases/volans/route.ts",
    "app/api/warlock/intake/route.ts",
  ]) {
    assert.match(source(path), /ensureEtsyAiDisclosure/);
  }
});

test("Printful supplier preflight is read-only", () => {
  const preflight = source("lib/warlock-commerce/printful-preflight.ts");
  assert.match(preflight, /products\/variant/);
  assert.match(preflight, /v2\/catalog-variants/);
  assert.doesNotMatch(preflight, /method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/i);
});

test("MCP exposes commerce gates and live supplier preflight as read-only tools", () => {
  const server = source("lib/warlock-mcp/server.ts");
  assert.match(server, /"evaluate_commerce_gates"/);
  assert.match(server, /"preflight_supplier"/);
  assert.match(server, /readOnlyHint: true/);
  assert.doesNotMatch(server, /method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/i);
});
