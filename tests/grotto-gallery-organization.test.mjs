import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (relative) => readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");
const gallery = source("app/api/grotto/images/route.ts");
const page = source("app/grotto/page.tsx");
const move = source("app/api/grotto/images/bulk-move/route.ts");
const remove = source("app/api/grotto/images/bulk-delete/route.ts");
const restore = source("app/api/grotto/images/bulk-restore/route.ts");
const storage = source("app/api/grotto/storage/migrate/route.ts");

test("Favorites is a global filtered view; normal galleries sort by creation, not favorite rank", () => {
  assert.match(gallery, /museId === "favorites" \? \{ favorite: true \} : \{ museId \}/);
  assert.match(gallery, /orderBy: \[\{ createdAt: "desc" \}, \{ id: "desc" \}]/);
  assert.doesNotMatch(gallery, /favorite: "desc"/);
  assert.match(gallery, /provider: \{ not: "header" \}/);
  assert.match(gallery, /UPLOAD_GALLERIES\.has\(museId\)/);
  assert.match(gallery, /studioInput: studioInputFromRecipe\(image\.recipeJson\)/);
});

test("All three collections share a multi-select toolbar and protected canon remains unselectable", () => {
  assert.match(page, /selectSpace\("favorites"\)/);
  assert.match(page, /const galleryToolbar =/);
  assert.match(page, /const galleryTiles =/);
  assert.match(page, /\{galleryToolbar\}\{galleryTiles\}/);
  assert.match(page, /selectionEligible = items\.filter\(\(item\) => item\.private && !item\.canonical\)/);
  assert.match(page, /selectedIds\.length >= 200/);
  assert.match(page, /Select loaded/);
  assert.match(page, /bulk-move/);
  assert.match(page, /bulk-delete/);
  assert.match(page, /bulk-restore/);
});

test("Batch moves check every ID atomically and only change gallery membership", () => {
  assert.match(move, /verifyArtistSession\(request\)/);
  assert.match(move, /new Set\(ids\)\.size !== ids\.length/);
  assert.match(move, /prisma\.\$transaction/);
  assert.match(move, /images\.length !== ids\.length/);
  assert.match(move, /canonical: false, provider: \{ not: "header" \}/);
  assert.match(move, /data: \{ museId: destination \}/);
  assert.doesNotMatch(move, /deleteGrottoImages|storeGrottoImage/);
});

test("Batch deletes are undoable and purge retained private Blob bytes after thirty days", () => {
  assert.match(remove, /prisma\.\$transaction/);
  assert.match(remove, /canonical: false, provider: \{ not: "header" \}/);
  assert.match(remove, /data: \{ deletedAt: new Date\(\) \}/);
  assert.doesNotMatch(remove, /deleteGrottoImages/);
  assert.match(restore, /30 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(restore, /data: \{ deletedAt: null \}/);
  assert.match(storage, /deletedAt: \{ lt: retentionCutoff \}/);
  assert.match(storage, /deleteGrottoImages\(expired\.map/);
});
