import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const fileUrl = (path) => new URL("../" + path, import.meta.url);
const source = (path) => readFileSync(fileUrl(path), "utf8");

test("legacy one-off Volans Etsy release route is retired", () => {
  assert.equal(
    existsSync(fileUrl("app/api/etsy/releases/volans/route.ts")),
    false,
  );

  const execution = source("lib/warlock-commerce/draft-execution.ts");
  const etsy = source("lib/warlock-commerce/etsy-draft-executor.ts");
  assert.match(execution, /executeEtsyDrafts/);
  assert.match(etsy, /buildPhysicalInventoryBody/);
  assert.match(etsy, /etsy_listing_not_draft/);
});

test("Volans canonical data locks the three-edition price and SKU ladder", () => {
  const lineup = source("prisma/migrations/20260925173000_finalize_volans_physical_lineup/migration.sql");
  assert.match(lineup, /VOLANS AETHEREUS — The Sky Wanderer/);
  assert.match(lineup, /4463/);
  assert.match(lineup, /2400/);
  assert.match(lineup, /2800/);
  assert.match(lineup, /6900/);
  assert.match(lineup, /12562279/);

  const executionIds = source("prisma/migrations/20260926001500_spellmark_draft_execution_ids/migration.sql");
  assert.match(executionIds, /SM-OWL-P1-V4463/);
  assert.match(executionIds, /SM-OWL-P1-V14125/);
  assert.match(executionIds, /SM-OWL-P2-V14292/);
});
