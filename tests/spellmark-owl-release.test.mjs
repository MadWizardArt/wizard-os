import test from "node:test";
import assert from "node:assert/strict";
import { SPELLMARK_RELEASE_REQUIREMENTS } from "../lib/spellmark-release-assets.ts";

test("Volans Aethereus release keeps exact required asset counts", () => {
  assert.deepEqual(SPELLMARK_RELEASE_REQUIREMENTS.spellmarkowldigitalv1, {
    imageCount: 4, digitalFileCount: 1, label: "Volans Aethereus — Digital",
  });
  assert.deepEqual(SPELLMARK_RELEASE_REQUIREMENTS.spellmarkowlunframedv1, {
    imageCount: 5, digitalFileCount: 0, label: "Volans Aethereus — Unframed 11×14",
  });
  assert.deepEqual(SPELLMARK_RELEASE_REQUIREMENTS.spellmarkowlframedv1, {
    imageCount: 6, digitalFileCount: 0, label: "Volans Aethereus — Black-framed 11×14",
  });
});
