import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rankSellerTaxonomy } from "../lib/warlock-commerce/etsy-taxonomy.ts";

const source = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("seller taxonomy ranking favors specific print categories without auto-selecting", () => {
  const tree = [{
    id: 1,
    name: "Art & Collectibles",
    level: 0,
    parent_id: null,
    children: [{
      id: 2,
      name: "Prints",
      level: 1,
      parent_id: 1,
      children: [{
        id: 3,
        name: "Digital Prints",
        level: 2,
        parent_id: 2,
        children: [],
      }, {
        id: 4,
        name: "Art Prints",
        level: 2,
        parent_id: 2,
        children: [],
      }],
    }, {
      id: 5,
      name: "Sculpture",
      level: 1,
      parent_id: 1,
      children: [],
    }],
  }];

  const ranked = rankSellerTaxonomy(tree, "art print wall art");
  assert.ok(ranked.length >= 2);
  assert.ok([3, 4].includes(ranked[0].id));
  assert.ok(ranked[0].score > ranked.find((candidate) => candidate.id === 5)?.score ?? 0);
});

test("Etsy configuration inspector uses GET-only shop and taxonomy endpoints", () => {
  const inspector = source("lib/warlock-commerce/etsy-config-inspector.ts");
  assert.match(inspector, /shipping-profiles/);
  assert.match(inspector, /readiness-state-definitions\?limit=100/);
  assert.match(inspector, /seller-taxonomy\/nodes/);
  assert.match(inspector, /method:\s*"GET"/);
  assert.match(inspector, /autoSelected:\s*false/);
  assert.doesNotMatch(inspector, /method:\s*"(?:POST|PUT|PATCH|DELETE)"/);
  assert.doesNotMatch(inspector, /prisma\.|spellmarkListing\.update|spellmarkListing\.upsert/);
});

test("inspector never exposes an Etsy access token", () => {
  const inspector = source("lib/warlock-commerce/etsy-config-inspector.ts");
  assert.doesNotMatch(inspector, /accessToken\s*[:,]\s*accessToken/);
  assert.doesNotMatch(inspector, /refresh_token/);
});

test("MCP exposes Etsy configuration discovery as a live read-only tool", () => {
  const server = source("lib/warlock-mcp/server.ts");
  assert.match(server, /"inspect_etsy_configuration"/);
  assert.match(server, /taxonomyQuery:\s*z\.string/);
  assert.match(server, /annotations:\s*liveReadAnnotations/);
  assert.match(server, /inspectEtsyConfiguration/);
});

test("configuration discovery does not enable draft execution", () => {
  const server = source("lib/warlock-mcp/server.ts");
  assert.match(server, /commerceWriteMode\(\) !== "draft"/);
  const env = source(".env.example");
  assert.match(env, /WARLOCK_COMMERCE_WRITE_MODE="disabled"/);
});
