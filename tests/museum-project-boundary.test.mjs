import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isMuseumInfrastructureNotes } from "../lib/museum-project-hygiene.ts";

test("Muse intelligence and council plumbing never become production projects", () => {
  for (const prefix of [
    "MUSEUM_BRIEF_V1:",
    "MUSEUM_CHAMBER_V1:",
    "MUSEUM_FOCUS_V1:",
    "MUSEUM_QUEST_V1:",
    "MUSEUM_SIGNAL_V1:",
    "MUSEUM_MEMORY_V1:",
    "MUSEUM_KNOWLEDGE_V1:",
    "MUSEUM_INTELLIGENCE_V1:",
    "MUSEUM_PROPOSAL_V1:",
    "MUSEUM_WORKING_STATE_V1:",
    "MUSEUM_COUNTERWEIGHT_V1:",
  ]) {
    assert.equal(isMuseumInfrastructureNotes(prefix + "{}"), true, prefix);
  }
});

test("production and Harvest work orders stay visible even when internal", () => {
  for (const notes of [
    null,
    "",
    "A real painting commission",
    "Harvest plan: finish September studio sale production and merchandising",
  ]) {
    assert.equal(isMuseumInfrastructureNotes(notes), false, String(notes));
  }
});

test("Projects API excludes Museum records before applying production or all-scope views", () => {
  const route = readFileSync(new URL("../app/api/projects/route.ts", import.meta.url), "utf8");
  assert.match(route, /\.filter\(\(project\) => !isMuseumInfrastructureNotes\(project\.notes\)\)/);
  assert.match(route, /includeCompleted \|\| inProduction/);
});
