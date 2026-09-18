import { Prisma, ProjectStatus, ProjectType } from "../app/generated/prisma/client";
import type { MuseId } from "./museum";
import type { ProposalCategory } from "./museum-proposal-storage";
import { createIntelligenceQuest, decodeIntelligenceQuest } from "./museum-intelligence";
import { getMuseMindKernel } from "./museum-mind-kernel";
import {
  decodeCounterweightPacket,
  encodeCounterweightPacket,
  MUSEUM_COUNTERWEIGHT_PREFIX,
  type CounterweightPacketRecord,
  type CounterweightPacketStatus,
  type StoredCounterweightPacket,
} from "./museum-counterweight-storage";

type CounterweightDb = Pick<Prisma.TransactionClient, "project" | "museumIntelligenceQuest">;

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function projectStatus(status: CounterweightPacketStatus) {
  if (status === "complete") return ProjectStatus.COMPLETE;
  if (status === "draft") return ProjectStatus.ACTIVE;
  return ProjectStatus.WAITING;
}

function nextAction(packet: StoredCounterweightPacket) {
  if (packet.status === "draft") return "Prepare the canonical counterweight quest. No AI is spent until the Artist explicitly fuels it.";
  if (packet.status === "counterweight-ready") return "Fuel the counterweight quest. After it completes, prepare the accountable synthesis quest.";
  if (packet.status === "synthesis-ready") return "Fuel the primary Muse synthesis quest, then close the packet after the synthesis completes.";
  return "Counterweight packet complete. Both powered reasoning lines remain in their original intelligence quest records.";
}

async function savePacket(db: CounterweightDb, id: string, packet: StoredCounterweightPacket) {
  await db.project.update({
    where: { id },
    data: {
      title: `[Counterweight Packet] ${packet.primaryMuseId} ↔ ${packet.counterweightMuseId} · ${packet.question.slice(0, 110)}`,
      status: projectStatus(packet.status),
      progress: packet.status === "complete" ? 100 : 0,
      nextAction: nextAction(packet),
      notes: encodeCounterweightPacket(packet),
      archivedAt: null,
    },
  });
  return { id, ...packet };
}

async function readPacket(db: CounterweightDb, id: string) {
  const row = await db.project.findUnique({ where: { id }, select: { id: true, notes: true } });
  const packet = row ? decodeCounterweightPacket(row.notes) : null;
  if (!row || !packet) throw new Error("Counterweight packet not found.");
  return { id: row.id, packet };
}

export async function listCounterweightPackets(db: CounterweightDb): Promise<CounterweightPacketRecord[]> {
  const rows = await db.project.findMany({
    where: { type: ProjectType.INTERNAL, notes: { startsWith: MUSEUM_COUNTERWEIGHT_PREFIX } },
    select: { id: true, notes: true },
    orderBy: { updatedAt: "desc" },
    take: 40,
  });

  return rows
    .map((row) => {
      const packet = decodeCounterweightPacket(row.notes);
      return packet ? { id: row.id, ...packet } : null;
    })
    .filter((item): item is CounterweightPacketRecord => Boolean(item));
}

export async function createCounterweightPacket(db: CounterweightDb, input: {
  primaryMuseId: MuseId;
  counterweightMuseId: MuseId;
  category: ProposalCategory;
  question: string;
  primaryPosition: string;
  trigger: string;
}) {
  if (input.primaryMuseId === input.counterweightMuseId) {
    throw new Error("A Muse cannot counterweight herself.");
  }

  const primaryKernel = getMuseMindKernel(input.primaryMuseId);
  const counterweightKernel = getMuseMindKernel(input.counterweightMuseId);
  if (!primaryKernel || !counterweightKernel) {
    throw new Error("Both Muses need implemented Mind Kernels before they can form a counterweight packet.");
  }

  const counterweight = primaryKernel.relationships.counterweights.find(
    (item) => item.museId === input.counterweightMuseId,
  );
  if (!counterweight) {
    throw new Error("This pair is not a canonical counterweight relationship for the primary Muse.");
  }

  const question = text(input.question, 1200);
  const primaryPosition = text(input.primaryPosition, 5000);
  const trigger = text(input.trigger, 1000);
  if (!question || !primaryPosition || !trigger) {
    throw new Error("Counterweight packets require a question, primary position, and trigger.");
  }

  const now = new Date().toISOString();
  const packet: StoredCounterweightPacket = {
    version: 1,
    primaryMuseId: input.primaryMuseId,
    counterweightMuseId: input.counterweightMuseId,
    category: input.category,
    question,
    primaryPosition,
    trigger,
    relationship: counterweight.relationship,
    status: "draft",
    counterweightQuestId: null,
    synthesisQuestId: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };

  const row = await db.project.create({
    data: {
      title: `[Counterweight Packet] ${packet.primaryMuseId} ↔ ${packet.counterweightMuseId} · ${question.slice(0, 110)}`,
      type: ProjectType.INTERNAL,
      status: ProjectStatus.ACTIVE,
      progress: 0,
      nextAction: nextAction(packet),
      notes: encodeCounterweightPacket(packet),
    },
    select: { id: true },
  });

  return { id: row.id, ...packet };
}

export async function prepareCounterweightQuest(db: CounterweightDb, id: string) {
  const { packet } = await readPacket(db, id);
  if (packet.counterweightQuestId) return { packet: { id, ...packet }, questId: packet.counterweightQuestId };
  if (packet.status !== "draft") throw new Error("Only draft packets can prepare a counterweight quest.");

  const quest = await createIntelligenceQuest(db, {
    museId: packet.counterweightMuseId,
    category: packet.category,
    question: [
      "COUNTERWEIGHT REVIEW",
      `Original accountable Muse: ${packet.primaryMuseId}`,
      `Question: ${packet.question}`,
      `Primary position: ${packet.primaryPosition}`,
      `Canonical relationship: ${packet.relationship}`,
      `Counterweight trigger: ${packet.trigger}`,
      "",
      "Use your own Mind doctrine. Challenge only where your canonical role materially changes the decision. Preserve valid parts of the primary position. Distinguish evidence, hypotheses, unknowns, and Artist Gates. Return a decision-useful counterweight, not theatrical disagreement.",
    ].join("\n"),
    reason: `The primary Muse identified a canonical ${packet.primaryMuseId}↔${packet.counterweightMuseId} trigger that may materially change the decision.`,
    expectedValue: "A distinct, evidence-aware counterweight that reveals a blind spot, cheaper experiment, risk, or constraint without replacing the accountable primary Muse.",
  });

  const updated: StoredCounterweightPacket = {
    ...packet,
    status: "counterweight-ready",
    counterweightQuestId: quest.id,
    updatedAt: new Date().toISOString(),
  };
  await savePacket(db, id, updated);
  return { packet: { id, ...updated }, questId: quest.id };
}

export async function prepareCounterweightSynthesis(db: CounterweightDb, id: string) {
  const { packet } = await readPacket(db, id);
  if (packet.synthesisQuestId) return { packet: { id, ...packet }, questId: packet.synthesisQuestId };
  if (!packet.counterweightQuestId) throw new Error("Prepare and complete the counterweight quest first.");

  const row = await db.museumIntelligenceQuest.findUnique({
    where: { id: packet.counterweightQuestId },
    select: { payload: true },
  });
  const counterweightQuest = row ? decodeIntelligenceQuest(row.payload) : null;
  if (!counterweightQuest || counterweightQuest.status !== "completed" || !counterweightQuest.answer) {
    throw new Error("The counterweight quest must complete before synthesis can be prepared.");
  }

  const quest = await createIntelligenceQuest(db, {
    museId: packet.primaryMuseId,
    category: packet.category,
    question: [
      "ACCOUNTABLE COUNTERWEIGHT SYNTHESIS",
      `Original question: ${packet.question}`,
      `Your original position: ${packet.primaryPosition}`,
      `Counterweight Muse: ${packet.counterweightMuseId}`,
      `Canonical relationship: ${packet.relationship}`,
      "",
      "COUNTERWEIGHT RESPONSE",
      counterweightQuest.answer,
      "",
      "As the accountable primary Muse, synthesize rather than vote. Preserve useful disagreement. State what changed, what did not change, what evidence supports each side, what remains unknown, and the single next action you recommend to the Artist. Do not claim the counterweight Muse executed anything beyond the completed intelligence quest.",
    ].join("\n"),
    reason: "A completed canonical counterweight response now needs one accountable synthesis rather than an unresolved multi-Muse debate.",
    expectedValue: "One primary-Muse synthesis that shows what the counterweight changed, preserves unresolved disagreement, and returns a bounded next action to the Artist.",
  });

  const updated: StoredCounterweightPacket = {
    ...packet,
    status: "synthesis-ready",
    synthesisQuestId: quest.id,
    updatedAt: new Date().toISOString(),
  };
  await savePacket(db, id, updated);
  return { packet: { id, ...updated }, questId: quest.id };
}

export async function completeCounterweightPacket(db: CounterweightDb, id: string) {
  const { packet } = await readPacket(db, id);
  if (packet.status === "complete") return { id, ...packet };
  if (!packet.synthesisQuestId) throw new Error("Prepare and complete the synthesis quest first.");

  const row = await db.museumIntelligenceQuest.findUnique({
    where: { id: packet.synthesisQuestId },
    select: { payload: true },
  });
  const synthesisQuest = row ? decodeIntelligenceQuest(row.payload) : null;
  if (!synthesisQuest || synthesisQuest.status !== "completed" || !synthesisQuest.answer) {
    throw new Error("The synthesis quest must complete before the packet can close.");
  }

  const now = new Date().toISOString();
  const updated: StoredCounterweightPacket = {
    ...packet,
    status: "complete",
    updatedAt: now,
    completedAt: now,
  };
  return savePacket(db, id, updated);
}
