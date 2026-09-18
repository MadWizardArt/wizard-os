import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NOVY_MIND_KERNEL,
  THALIA_MIND_KERNEL,
  buildMuseMindSystemPrompt,
  getMuseMindKernel,
} from "../lib/museum-mind-kernel.ts";

test("Novy and Thalia have implemented Mind Kernels while unadapted Muses remain on legacy charters", () => {
  assert.equal(getMuseMindKernel("novy"), NOVY_MIND_KERNEL);
  assert.equal(getMuseMindKernel("thalia"), THALIA_MIND_KERNEL);
  assert.equal(getMuseMindKernel("callista"), null);
});

test("Novy kernel preserves canonical role, question, bias, and operating line", () => {
  assert.equal(NOVY_MIND_KERNEL.canon.role, "Systems Architect");
  assert.equal(NOVY_MIND_KERNEL.canon.coreQuestion, "How does it connect and work?");
  assert.equal(NOVY_MIND_KERNEL.canon.operatingLine, "Connect what matters. Build only what earns its place.");
  assert.match(NOVY_MIND_KERNEL.canon.builtInBias, /over-engineer/i);
});

test("Mind Kernel keeps canon, memory, working state, evidence, and capabilities separate", () => {
  assert.ok(NOVY_MIND_KERNEL.canon);
  assert.ok(NOVY_MIND_KERNEL.memoryPolicy);
  assert.ok(NOVY_MIND_KERNEL.workingStatePolicy);
  assert.ok(NOVY_MIND_KERNEL.evidencePolicy);
  assert.ok(NOVY_MIND_KERNEL.capabilityPolicy);
  assert.match(NOVY_MIND_KERNEL.workingStatePolicy.rules.join(" "), /outside the static Mind Kernel/i);
  assert.match(NOVY_MIND_KERNEL.memoryPolicy.doNotPromote.join(" "), /Temporary task state/i);
});

test("Novy system prompt enforces epistemic honesty and the Artist Gate", () => {
  const prompt = buildMuseMindSystemPrompt(NOVY_MIND_KERNEL);
  assert.match(prompt, /CORE QUESTION: How does it connect and work\?/);
  assert.match(prompt, /EVIDENCE RULES:/);
  assert.match(prompt, /MEMORY DISCIPLINE:/);
  assert.match(prompt, /WORKING STATE:/);
  assert.match(prompt, /ARTIST GATE:/);
  assert.match(prompt, /You are not autonomous/i);
  assert.match(prompt, /request to build something is not evidence that it was built/i);
});


test("Novy Mind carries an explicit Artist relationship contract", () => {
  const relationship = NOVY_MIND_KERNEL.relationships.artist;
  assert.equal(relationship.version, 1);
  assert.match(relationship.authority, /final decision authority/i);
  assert.match(relationship.challengeDoctrine.join(" "), /advisory/i);
  assert.match(relationship.continuationDoctrine.join(" "), /without routine reconfirmation/i);
  assert.match(relationship.handoffDoctrine.join(" "), /objective.*accountable owner.*evidence/i);
  assert.match(relationship.trustRules.join(" "), /Unverified impressions/i);
  assert.match(relationship.trustRules.join(" "), /second relationship ledger/i);
});

test("Novy system prompt makes the Artist relationship contract explicit", () => {
  const prompt = buildMuseMindSystemPrompt(NOVY_MIND_KERNEL);
  assert.match(prompt, /ARTIST RELATIONSHIP CONTRACT:/);
  assert.match(prompt, /Authority:/);
  assert.match(prompt, /Challenge:/);
  assert.match(prompt, /Continuation:/);
  assert.match(prompt, /Handoff:/);
  assert.match(prompt, /Trust:/);
  assert.match(prompt, /final decision authority/i);
});


test("Thalia kernel is a distinct Creative Provocateur rather than a Novy clone", () => {
  assert.equal(THALIA_MIND_KERNEL.canon.role, "Creative Provocateur");
  assert.equal(THALIA_MIND_KERNEL.canon.archetype, "The Spark");
  assert.equal(THALIA_MIND_KERNEL.canon.coreQuestion, "What happens if we try the version nobody sensible suggested first?");
  assert.equal(THALIA_MIND_KERNEL.canon.operatingLine, "Break the pattern before the pattern becomes the cage.");
  assert.match(THALIA_MIND_KERNEL.canon.builtInBias, /Divergence can continue/i);
  assert.match(THALIA_MIND_KERNEL.reasoning.objective, /cheapest reversible experiment/i);
  assert.match(THALIA_MIND_KERNEL.memoryPolicy.doNotPromote.join(" "), /Raw brainstorm ideas/i);
  assert.match(THALIA_MIND_KERNEL.capabilityPolicy.prohibited.join(" "), /committed scope/i);
  assert.deepEqual(THALIA_MIND_KERNEL.outputContract.requiredSections, [
    "Pattern to break",
    "Possibilities",
    "Best experiment",
    "Evidence",
    "Unknowns",
    "Artist Gate",
    "Next action",
  ]);
});

test("counterweight relationships support the canon's one-to-many structure", () => {
  assert.deepEqual(
    NOVY_MIND_KERNEL.relationships.counterweights.map((item) => item.museId),
    ["thalia"],
  );
  assert.deepEqual(
    THALIA_MIND_KERNEL.relationships.counterweights.map((item) => item.museId),
    ["novy", "callista", "melina"],
  );
  assert.match(THALIA_MIND_KERNEL.relationships.counterweights[0].relationship, /systems.*experimentation/i);
  assert.match(THALIA_MIND_KERNEL.relationships.counterweights[1].relationship, /allocation.*divergence/i);
  assert.match(THALIA_MIND_KERNEL.relationships.counterweights[2].relationship, /risk.*experimentation/i);
});

test("Thalia system prompt preserves experiment discipline and counterweight routing", () => {
  const prompt = buildMuseMindSystemPrompt(THALIA_MIND_KERNEL);
  assert.match(prompt, /CORE QUESTION: What happens if we try the version nobody sensible suggested first\?/);
  assert.match(prompt, /COUNTERWEIGHT RELATIONSHIPS:/);
  assert.match(prompt, /novy: Durable systems and synthesis/i);
  assert.match(prompt, /callista: Commitment and allocation/i);
  assert.match(prompt, /melina: Risk awareness/i);
  assert.match(prompt, /not evidence that another Muse was actually consulted/i);
  assert.match(prompt, /Novelty is not evidence/i);
  assert.match(prompt, /You are not autonomous/i);
});
