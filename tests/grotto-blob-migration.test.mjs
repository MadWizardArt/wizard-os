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

test("browser cleanup verifies Blob size before releasing Neon bytes", () => {
  assert.match(route, /inspectGrottoImage\(image\.blobUrl\)/);
  assert.match(route, /Number\(remote\.size\) !== localSize/);
  assert.match(route, /data: \{ imageData: null \}/);
  assert.match(route, /Deleted-row purge blocked/);
});

test("Blob-backed file routes avoid selecting legacy bytea on their primary read", () => {
  const fileRoute = readFileSync(new URL("../app/api/grotto/images/[id]/file/route.ts", import.meta.url), "utf8");
  const referenceRoute = readFileSync(new URL("../app/api/grotto/reference/[id]/route.ts", import.meta.url), "utf8");
  assert.match(fileRoute, /select: \{ blobUrl: true, contentType: true, byteSize: true \}/);
  assert.match(referenceRoute, /select: \{ blobUrl: true, contentType: true \}/);
});
