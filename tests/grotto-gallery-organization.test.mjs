import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const source = (relative) => readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");
const gallery = source("app/api/grotto/images/route.ts");
const page = source("app/grotto/page.tsx");
const favorite = source("app/api/grotto/images/bulk-favorite/route.ts");
const remove = source("app/api/grotto/images/bulk-delete/route.ts");
const purge = source("app/api/grotto/images/purge-non-favorites/route.ts");
const deletion = source("lib/grotto-delete.ts");

test("Grotto exposes only All, Favorites and a timestamp-backed Recent collection", () => {
  assert.match(gallery, /new Set\(\["all", "favorites", "recent"\]\)/);
  assert.match(gallery, /collection === "favorites" \? \{ favorite: true \} : \{\}/);
  assert.match(gallery, /collection === "recent" && offset >= 48/);
  assert.match(gallery, /createdAt: "desc"/);
  assert.match(page, />All</);
  assert.match(page, />♥ Favorites</);
  assert.match(page, />Recent</);
  assert.doesNotMatch(page, /Move to|Move selected|Muse Galleries/);
});

test("Multi-select is limited to Favorite, Unfavorite and Delete", () => {
  assert.match(page, /favoriteSelected\(true\)/);
  assert.match(page, /favoriteSelected\(false\)/);
  assert.match(page, /deleteSelected\(\)/);
  assert.match(favorite, /typeof favorite !== "boolean"/);
  assert.match(favorite, /prisma\.\$transaction/);
  assert.match(remove, /deleteGrottoImageIds\(ids\)/);
  assert.equal(existsSync(new URL("../app/api/grotto/images/bulk-move/route.ts", import.meta.url)), false);
  assert.equal(existsSync(new URL("../app/api/grotto/images/bulk-restore/route.ts", import.meta.url)), false);
});

test("Delete All Non-Favorites is counted, double-confirmed and fail-closed", () => {
  assert.match(page, /Delete All Non-Favorites/);
  assert.match(page, /setPurgeStep\(2\)/);
  assert.match(page, /second and final confirmation/);
  assert.match(page, /confirmation: "DELETE NON-FAVORITES"/);
  assert.match(purge, /expectedCount/);
  assert.match(deletion, /favorite: false/);
  assert.match(deletion, /FOR UPDATE/);
  assert.match(deletion, /TransactionIsolationLevel\.Serializable/);
  assert.match(deletion, /deleteGrottoImages\(blobUrls\)/);
  assert.match(deletion, /deleted\.count !== rows\.length/);
});

test("Muse identity remains provenance while the Atelier uses ten real interchangeable references", () => {
  assert.match(gallery, /museId: image\.museId/);
  assert.match(gallery, /studioInput: studioInputFromRecipe\(image\.recipeJson\)/);
  assert.match(page, /REFERENCE_SLOT_COUNT = 10/);
  assert.match(page, /Generation reference bank/);
  assert.match(page, /activeReferenceId/);
  assert.match(page, /referenceId: primary\.id/);
  assert.match(page, /REFERENCE_STORAGE_KEY/);
  assert.match(page, /Add to References/);
  assert.match(page, /Remix in Atelier/);
  assert.match(page, /setStudioLoras\(Array\.isArray\(input\.loras\)/);
  assert.match(page, /setStudioEmbeddings\(Array\.isArray\(input\.embeddings\)/);
  assert.match(page, /setStrength\(typeof input\.strength === "number" \? input\.strength : 0\.35\)/);
  assert.match(page, />The Atelier</);
  assert.doesNotMatch(page, /Muse generation references|canonicalItem\(muse\)|ROLE_LABELS|ReferenceRole/);
  assert.doesNotMatch(page, /bulk-move/);
});
