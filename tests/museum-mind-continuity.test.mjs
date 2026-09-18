import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canGraduateMuseWorkingState,
  decodeMuseWorkingState,
  encodeMuseWorkingState,
} from "../lib/museum-working-state-storage.ts";
import { readFileSync } from "node:fs";

function state(overrides = {}) {
  return {
    version: 1,
    museId: "novy",
    objective: "Build persistent continuity without contaminating canon",
    category: "system",
    sourceKey: "test:novy:persistent-mind",
    sourceProjectId: null,
    status: "active",
    nextAction: "Verify the lifecycle",
    completionCondition: "Working state can be verified and explicitly graduated into memory.",
    notes: "Temporary implementation state.",
    evidenceRefs: [],
    verificationStatus: "unverified",
    verifiedAt: null,
    createdAt: "2026-09-18T20:00:00.000Z",
    updatedAt: "2026-09-18T20:00:00.000Z",
    completedAt: null,
    graduatedMemoryId: null,
    ...overrides,
  };
}

test("working-state storage round trips without becoming memory", () => {
  const input = state();
  const decoded = decodeMuseWorkingState(encodeMuseWorkingState(input));
  assert.deepEqual(decoded, input);
  assert.equal(decoded.verificationStatus, "unverified");
  assert.equal(decoded.graduatedMemoryId, null);
});

test("active or unevidenced state cannot graduate", () => {
  assert.equal(canGraduateMuseWorkingState(state()).allowed, false);
  assert.match(canGraduateMuseWorkingState(state()).reason, /must be complete/i);

  const complete = state({
    status: "complete",
    completedAt: "2026-09-18T20:10:00.000Z",
  });
  assert.equal(canGraduateMuseWorkingState(complete).allowed, false);
  assert.match(canGraduateMuseWorkingState(complete).reason, /verified/i);
});

test("only complete, verified, evidenced, ungraduated state may become durable memory", () => {
  const eligible = state({
    status: "complete",
    completedAt: "2026-09-18T20:10:00.000Z",
    verificationStatus: "system-verified",
    verifiedAt: "2026-09-18T20:11:00.000Z",
    evidenceRefs: ["GitHub PR #72", "CI build"],
  });
  assert.deepEqual(canGraduateMuseWorkingState(eligible), { allowed: true, reason: null });

  const alreadyGraduated = { ...eligible, graduatedMemoryId: "memory_123" };
  assert.equal(canGraduateMuseWorkingState(alreadyGraduated).allowed, false);
  assert.match(canGraduateMuseWorkingState(alreadyGraduated).reason, /already graduated/i);
});

test("Novy intelligence explicitly consumes personal continuity", () => {
  const source = readFileSync(new URL("../lib/museum-intelligence.ts", import.meta.url), "utf8");
  assert.match(source, /readMuseMindContinuity/);
  assert.match(source, /syncIntelligenceWorkingState/);
  assert.match(source, /"active"/);
  assert.match(source, /"waiting"/);
  assert.match(source, /"blocked"/);
  assert.match(source, /PERSONAL MIND CONTINUITY/);
  assert.match(source, /Working state:/);
  assert.match(source, /Personal memory:/);
});
