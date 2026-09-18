import type { MuseId } from "./museum";
import type { ProposalCategory } from "./museum-proposal-storage";
export const MUSEUM_COUNTERWEIGHT_PREFIX = "MUSEUM_COUNTERWEIGHT_V1:";

export type CounterweightPacketStatus =
  | "draft"
  | "counterweight-ready"
  | "synthesis-ready"
  | "complete";

export type StoredCounterweightPacket = {
  version: 1;
  primaryMuseId: MuseId;
  counterweightMuseId: MuseId;
  category: ProposalCategory;
  question: string;
  primaryPosition: string;
  trigger: string;
  relationship: string;
  status: CounterweightPacketStatus;
  counterweightQuestId: string | null;
  synthesisQuestId: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type CounterweightPacketRecord = StoredCounterweightPacket & { id: string };

const MUSE_IDS = new Set<MuseId>([
  "novy",
  "callista",
  "aurelia",
  "cleo",
  "lyra",
  "melina",
  "seraphine",
  "tessa",
  "thalia",
]);

const STATUSES = new Set<CounterweightPacketStatus>([
  "draft",
  "counterweight-ready",
  "synthesis-ready",
  "complete",
]);

const CATEGORIES = new Set<ProposalCategory>([
  "revenue",
  "product",
  "content",
  "system",
  "risk",
  "research",
  "capacity",
  "experiment",
]);

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function iso(value: unknown) {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function encodeCounterweightPacket(packet: StoredCounterweightPacket) {
  return `${MUSEUM_COUNTERWEIGHT_PREFIX}${JSON.stringify(packet)}`;
}

export function decodeCounterweightPacket(notes: string | null): StoredCounterweightPacket | null {
  if (!notes?.startsWith(MUSEUM_COUNTERWEIGHT_PREFIX)) return null;
  try {
    const parsed = JSON.parse(notes.slice(MUSEUM_COUNTERWEIGHT_PREFIX.length)) as Record<string, unknown>;
    if (Number(parsed.version) !== 1) return null;
    if (!STATUSES.has(parsed.status as CounterweightPacketStatus)) return null;
    if (!CATEGORIES.has(parsed.category as ProposalCategory)) return null;

    const primaryMuseId = parsed.primaryMuseId as MuseId;
    const counterweightMuseId = parsed.counterweightMuseId as MuseId;
    if (!MUSE_IDS.has(primaryMuseId) || !MUSE_IDS.has(counterweightMuseId)) return null;

    const question = text(parsed.question, 1200);
    const primaryPosition = text(parsed.primaryPosition, 5000);
    const trigger = text(parsed.trigger, 1000);
    const relationship = text(parsed.relationship, 500);
    const createdAt = iso(parsed.createdAt);
    const updatedAt = iso(parsed.updatedAt);
    const completedAt = parsed.completedAt == null ? null : iso(parsed.completedAt);
    if (!question || !primaryPosition || !trigger || !relationship || !createdAt || !updatedAt) return null;

    return {
      version: 1,
      primaryMuseId,
      counterweightMuseId,
      category: parsed.category as ProposalCategory,
      question,
      primaryPosition,
      trigger,
      relationship,
      status: parsed.status as CounterweightPacketStatus,
      counterweightQuestId: text(parsed.counterweightQuestId, 120) || null,
      synthesisQuestId: text(parsed.synthesisQuestId, 120) || null,
      createdAt,
      updatedAt,
      completedAt,
    };
  } catch {
    return null;
  }
}
