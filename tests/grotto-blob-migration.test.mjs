import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(new URL("../app/api/grotto/storage/migrate/route.ts", import.meta.url), "utf8");
const script = readFileSync(new URL("../scripts/migrate-grotto-images-to-blob.mjs", import.meta.url), "utf8");

test("browser migration copies and verifies before preserving the Neon payload", () => {
  assert.match(route, /inspectGrottoImage\(blob\.url\)/);
  assert.match(route, /data: \{ blobUrl: blob\.url \}/);
  assert.doesNotMatch(route, /data: \{ blobUrl: blob\.url, imageData: null \}/);
});

test("cleanup requires confirmation and refuses to run while copies are pending", () => {
  assert.match(script, /cleanup && !confirmed/);
  assert.match(script, /Refusing cleanup:/);
  assert.match(script, /--cleanup --yes/);
});
