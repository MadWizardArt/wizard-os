import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Volans physical release is one Etsy listing with the locked three-edition price ladder", () => {
  const route = source("app/api/etsy/releases/volans/route.ts");
  assert.match(route, /8×10 unframed/);
  assert.match(route, /11×14 unframed/);
  assert.match(route, /11×14 black framed/);
  assert.match(route, /24\.00/);
  assert.match(route, /28\.00/);
  assert.match(route, /69\.00/);
  assert.match(route, /SM-OWL-P1-V4463/);
  assert.match(route, /SM-OWL-P1-V14125/);
  assert.match(route, /SM-OWL-P2-V14292/);
  assert.match(route, /method: "PUT"/);
  assert.match(route, /property_id: 513/);
  assert.match(route, /type: "physical"/);
});

test("Volans database correction locks canonical title and final retail values", () => {
  const migration = source("prisma/migrations/20260925173000_finalize_volans_physical_lineup/migration.sql");
  assert.match(migration, /VOLANS AETHEREUS — The Sky Wanderer/);
  assert.match(migration, /4463/);
  assert.match(migration, /2400/);
  assert.match(migration, /2800/);
  assert.match(migration, /6900/);
  assert.match(migration, /12562279/);
});
