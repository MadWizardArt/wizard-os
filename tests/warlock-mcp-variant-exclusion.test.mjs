import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const server = fs.readFileSync("lib/warlock-mcp/server.ts", "utf8");
const exclusion = fs.readFileSync("lib/warlock-commerce/variant-exclusion.ts", "utf8");

test("MCP exposes the standalone explicitly confirmed exclusion tool", () => {
  assert.match(server, /"exclude_pre_draft_variants"/);
  assert.match(server, /inputSchema: excludePreDraftVariantsShape/);
  assert.match(exclusion, /confirmVariantRemoval: z\.literal\(true\)/);
  assert.match(server, /destructiveHint: true/);
});

test("exclusion archives removals and never calls a remote marketplace", () => {
  assert.match(exclusion, /PRE_DRAFT_VARIANTS_REMOVED/);
  assert.match(exclusion, /spellmarkJournal\.create/);
  assert.match(exclusion, /spellmarkVariant\.deleteMany/);
  assert.match(exclusion, /variant_removal_requires_reconciliation/);
  assert.match(exclusion, /variant_removal_would_orphan_listing/);
  assert.match(exclusion, /variant_removal_not_owned_by_product/);
  assert.doesNotMatch(exclusion, /fetch\(|etsyClient|printfulClient/);
});

test("exact retries are idempotent and delete is product scoped", () => {
  assert.match(exclusion, /alreadyApplied: true/);
  assert.match(exclusion, /productId: input\.productId, id: \{ in: sortedIds \}/);
  assert.match(exclusion, /FOR UPDATE/);
});
