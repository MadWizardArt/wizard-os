import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("Museum shows character profiles without mirroring Crucible project cards", () => {
  const museum = read("../app/museum/page.tsx");
  const room = read("../app/museum/MuseRoom.tsx");
  assert.doesNotMatch(museum, /Nearby operational context|projects\\.slice\\(0, 8\\)|copyCouncilPacket/);
  assert.match(room, /MUSE_AGENT_CHARTERS\\[muse\\.id\\]/);
  assert.match(room, /\/api\/museum\/memory\\?muse=/);
  assert.match(room, /\/grotto\\?muse=/);
  assert.doesNotMatch(room, /Visual only\\. Manual presence/);
});

test("Council routes one accountable question to existing gated Intelligence", () => {
  const museum = read("../app/museum/page.tsx");
  const intelligence = read("../app/museum/intelligence/page.tsx");
  assert.match(museum, /source: "council", muse: lead\\.id, brief/);
  assert.match(museum, /Continue to Intelligence/);
  assert.match(intelligence, /query\\.get\\("source"\\) === "council"/);
  assert.match(intelligence, /setDraft\\(\\{ museId: requested/);
  assert.match(intelligence, /open=\\{incomingReview\\}/);
  assert.match(intelligence, /Shared cognition.*routed evidence/);
});

test("Agency focuses on proposals while profiles own charter and memory presentation", () => {
  const agency = read("../app/museum/agency/page.tsx");
  assert.doesNotMatch(agency, /AGENT CHARTERS|Memory Ledger/);
  assert.match(agency, /Proposal Queue/);
  assert.match(agency, /outcomeByProposal/);
  assert.match(agency, /recordOutcome/);
});

test("Gallery deep links preserve the requested Muse and maintain fallback Atelier", () => {
  const grotto = read("../app/grotto/page.tsx");
  assert.match(grotto, /new URLSearchParams\\(window\\.location\\.search\\)\\.get\\("muse"\\)/);
  assert.match(grotto, /loadGallery\\(initialSpace\\)/);
});
