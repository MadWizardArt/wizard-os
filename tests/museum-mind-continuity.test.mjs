import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canGraduateMuseWorkingState,
  decodeMuseWorkingState,
  encodeMuseWorkingState,
} from "../lib/museum-working-state-storage.ts";
import { readFileSync } from "node:fs";
import {
  decodeCounterweightPacket,
  encodeCounterweightPacket,
} from "../lib/museum-counterweight-storage.ts";

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


test("mind-state API preserves omitted optional fields instead of clearing or reopening state", () => {
  const source = readFileSync(new URL("../app/api/museum/mind-state/route.ts", import.meta.url), "utf8");
  assert.match(source, /function optionalNullableText/);
  assert.match(source, /if \(body\.status !== undefined\)/);
  assert.match(source, /Choose a valid working-state status/);
  assert.match(source, /sourceProjectId: optionalNullableText\(body\.sourceProjectId, 120\)/);
  assert.match(source, /nextAction: optionalNullableText\(body\.nextAction, 700\)/);
  assert.match(source, /notes: optionalNullableText\(body\.notes, 1400\)/);
  assert.match(source, /evidenceRefs: body\.evidenceRefs === undefined \? undefined : refs\(body\.evidenceRefs\)/);
  assert.doesNotMatch(source, /body\.status as MuseWorkingStateStatus\) \? body\.status as MuseWorkingStateStatus : "active"/);
});


test("Intelligence Chamber exposes Novy continuity through the existing mind-state API", () => {
  const source = readFileSync(new URL("../app/museum/intelligence/page.tsx", import.meta.url), "utf8");
  assert.match(source, /\/api\/museum\/mind-state\?muse=novy/);
  assert.match(source, /NOVY MIND · REFERENCE ORGANISM/);
  assert.match(source, /Mark complete/);
  assert.match(source, /action: "verify"/);
  assert.match(source, /action: "graduate"/);
  assert.match(source, /Graduate lesson/);
});


test("powered Novy reasoning records the Artist relationship contract as context", () => {
  const source = readFileSync(new URL("../lib/museum-intelligence.ts", import.meta.url), "utf8");
  assert.match(source, /Artist relationship:/);
  assert.match(source, /mindKernel\.relationships\.artist\.version/);
});


test("mind-state API exposes the same Artist relationship contract used by Novy Mind", () => {
  const source = readFileSync(new URL("../app/api/museum/mind-state/route.ts", import.meta.url), "utf8");
  assert.match(source, /getMuseMindKernel/);
  assert.match(source, /relationship: mindKernel\?\.relationships\.artist \?\? null/);
});

test("Intelligence Chamber renders the inspectable Artist relationship contract", () => {
  const source = readFileSync(new URL("../app/museum/intelligence/page.tsx", import.meta.url), "utf8");
  assert.match(source, /ARTIST RELATIONSHIP V/);
  assert.match(source, /Our working contract/);
  assert.match(source, /Canonical · inspectable · not scored/);
  assert.match(source, /challengeDoctrine/);
  assert.match(source, /continuationDoctrine/);
  assert.match(source, /handoffDoctrine/);
  assert.match(source, /trustRules/);
});


test("counterweight packet storage round trips without becoming memory or duplicating quest answers", () => {
  const packet = {
    version: 1,
    primaryMuseId: "novy",
    counterweightMuseId: "thalia",
    category: "system",
    question: "Should this architecture be built now?",
    primaryPosition: "Build the smallest coherent implementation.",
    trigger: "A cheap reversible experiment may answer the question more quickly.",
    relationship: "Durable systems and synthesis ↔ experimentation and possibility.",
    status: "draft",
    counterweightQuestId: null,
    synthesisQuestId: null,
    createdAt: "2026-09-18T23:30:00.000Z",
    updatedAt: "2026-09-18T23:30:00.000Z",
    completedAt: null,
  };
  assert.deepEqual(decodeCounterweightPacket(encodeCounterweightPacket(packet)), packet);
  assert.equal(Object.hasOwn(packet, "counterweightAnswer"), false);
  assert.equal(Object.hasOwn(packet, "synthesisAnswer"), false);
});

test("Counterweight Packet V1 prepares quests but never fuels AI implicitly", () => {
  const source = readFileSync(new URL("../lib/museum-counterweight.ts", import.meta.url), "utf8");
  assert.match(source, /createIntelligenceQuest/);
  assert.doesNotMatch(source, /runIntelligenceQuest/);
  assert.match(source, /The counterweight quest must complete before synthesis can be prepared/);
  assert.match(source, /The synthesis quest must complete before the packet can close/);
  assert.match(source, /relationships\.counterweights\.find/);
  assert.match(source, /synthesize rather than vote/i);
});

test("Counterweight Packet V1 is exposed in the Intelligence Chamber", () => {
  const source = readFileSync(new URL("../app/museum/intelligence/page.tsx", import.meta.url), "utf8");
  assert.match(source, /COUNCIL COUNTERWEIGHT · V1/);
  assert.match(source, /Create counterweight packet/);
  assert.match(source, /prepare-counterweight/);
  assert.match(source, /prepare-synthesis/);
  assert.match(source, /Close packet/);
  assert.match(source, /Preparing is free · fueling is explicit/);
});


test("intelligence source quests are loaded as attributed context instead of stuffed into the capped question field", () => {
  const source = readFileSync(new URL("../lib/museum-intelligence.ts", import.meta.url), "utf8");
  assert.match(source, /sourceQuestIds\?: string\[\]/);
  assert.match(source, /sourceQuestIds: sourceQuestIds\(input\.sourceQuestIds\)/);
  assert.match(source, /Referenced intelligence source .* is missing or incomplete/);
  assert.match(source, /RELATED COMPLETED INTELLIGENCE/);
  assert.match(source, /attributed completed Muse syntheses, not automatically verified outcomes/i);
  assert.match(source, /Intelligence source:/);
  assert.match(source, /sourceQuestIds: quest\.sourceQuestIds \?\? \[\]/);
});

test("counterweight synthesis references the completed counterweight quest directly", () => {
  const source = readFileSync(new URL("../lib/museum-counterweight.ts", import.meta.url), "utf8");
  assert.match(source, /sourceQuestIds: \[packet\.counterweightQuestId\]/);
  assert.match(source, /attached as authoritative source-quest context/i);
  assert.doesNotMatch(source, /"COUNTERWEIGHT RESPONSE"[\s\S]{0,120}counterweightQuest\.answer/);
});


test("default Museum intelligence budget allows four daily runs without widening token ceilings", () => {
  const source = readFileSync(new URL("../lib/museum-artist-auth.ts", import.meta.url), "utf8");
  assert.match(source, /MUSE_INTELLIGENCE_MAX_RUNS_PER_DAY\) \|\| 4/);
  assert.match(source, /MUSE_INTELLIGENCE_DAILY_TOKEN_BUDGET\) \|\| 15000/);
  assert.match(source, /MUSE_INTELLIGENCE_MAX_OUTPUT_TOKENS\) \|\| 1000/);
});


test("Intelligence Chamber uses one compact forum board instead of stacked feature dashboards", () => {
  const page = readFileSync(new URL("../app/museum/intelligence/page.tsx", import.meta.url), "utf8");
  assert.match(page, /COUNCIL BOARD/);
  assert.match(page, /New quest/);
  assert.match(page, /New counterweight/);
  assert.match(page, /boardFilter/);
  assert.match(page, /threadRow/);
  assert.match(page, /Action ·/);
  assert.match(page, /Quests ·/);
  assert.match(page, /Packets ·/);
  assert.match(page, /Knowledge ·/);
  assert.doesNotMatch(page, /<section className=\{styles\.stats\}>/);
  assert.doesNotMatch(page, /NOVY MIND · REFERENCE ORGANISM/);
  assert.doesNotMatch(page, /COUNCIL COUNTERWEIGHT · V1/);
  assert.doesNotMatch(page, /QUEST LOG/);
});

test("Intelligence forum CSS keeps threads compact until opened", () => {
  const css = readFileSync(new URL("../app/museum/intelligence/selective-intelligence.module.css", import.meta.url), "utf8");
  assert.match(css, /\.threadRow > summary/);
  assert.match(css, /white-space: nowrap/);
  assert.match(css, /text-overflow: ellipsis/);
  assert.match(css, /\.threadBody/);
  assert.match(css, /\.boardFilters/);
});
