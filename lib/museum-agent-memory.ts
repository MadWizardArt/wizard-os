import { Prisma, ProjectStatus, ProjectType } from "../app/generated/prisma/client";
import type { MuseId } from "./museum";
import type { ProposalCategory, ProposalConfidence } from "./museum-proposal-storage";
import {
  decodeMuseMemory,
  encodeMuseMemory,
  MUSEUM_MEMORY_PREFIX,
  type MuseMemoryKind,
  type MuseMemoryVerifiedBy,
  type MuseOutcomeRating,
  type StoredMuseMemory,
} from "./museum-memory-storage";

export type MuseMemoryInput = {
  museId: MuseId;
  kind: MuseMemoryKind;
  title: string;
  summary: string;
  category: ProposalCategory;
  sourceKey: string;
  sourceProposalId?: string | null;
  outcomeRating?: MuseOutcomeRating | null;
  actualValue?: string | null;
  verifiedBy?: MuseMemoryVerifiedBy;
  createdAt?: Date;
};

type MemoryDb = Pick<Prisma.TransactionClient, "project">;

export async function recordMuseMemory(db: MemoryDb, input: MuseMemoryInput) {
  const sourceKey = input.sourceKey.trim().slice(0, 260);
  if (!sourceKey) throw new Error("Muse memory requires a source key.");

  const existing = await db.project.findFirst({
    where: {
      type: ProjectType.INTERNAL,
      notes: { startsWith: MUSEUM_MEMORY_PREFIX, contains: sourceKey },
    },
    select: { id: true, notes: true },
  });

  if (existing) {
    const decoded = decodeMuseMemory(existing.notes);
    if (decoded?.sourceKey === sourceKey) return { id: existing.id, memory: decoded, created: false };
  }

  const memory: StoredMuseMemory = {
    version: 1,
    museId: input.museId,
    kind: input.kind,
    title: input.title.trim().slice(0, 180),
    summary: input.summary.trim().slice(0, 1200),
    category: input.category,
    sourceKey,
    sourceProposalId: input.sourceProposalId?.trim().slice(0, 120) || null,
    outcomeRating: input.outcomeRating ?? null,
    actualValue: input.actualValue?.trim().slice(0, 300) || null,
    verifiedBy: input.verifiedBy ?? "artist",
    createdAt: (input.createdAt ?? new Date()).toISOString(),
  };

  if (!memory.title || !memory.summary) throw new Error("Muse memory is missing required content.");

  const record = await db.project.create({
    data: {
      title: `[Muse Memory] ${memory.title}`,
      type: ProjectType.INTERNAL,
      status: ProjectStatus.COMPLETE,
      progress: 100,
      nextAction: "Retained for future Muse reasoning",
      notes: encodeMuseMemory(memory),
    },
    select: { id: true },
  });

  return { id: record.id, memory, created: true };
}

export type MuseMemoryCalibration = {
  sampleSize: number;
  positive: number;
  neutral: number;
  weak: number;
  suggestedConfidence: ProposalConfidence | null;
  note: string | null;
};

export async function readMuseMemoryCalibration(
  db: MemoryDb,
  museId: MuseId,
  category: ProposalCategory,
): Promise<MuseMemoryCalibration> {
  const records = await db.project.findMany({
    where: {
      type: ProjectType.INTERNAL,
      notes: { startsWith: MUSEUM_MEMORY_PREFIX },
    },
    select: { notes: true },
    orderBy: { createdAt: "desc" },
    take: 160,
  });

  const outcomes = records
    .map((record) => decodeMuseMemory(record.notes))
    .filter((memory): memory is StoredMuseMemory => Boolean(memory))
    .filter((memory) => memory.museId === museId && memory.category === category && memory.kind === "outcome" && Boolean(memory.outcomeRating))
    .slice(0, 12);

  const positive = outcomes.filter((memory) => memory.outcomeRating === "strong" || memory.outcomeRating === "useful").length;
  const neutral = outcomes.filter((memory) => memory.outcomeRating === "neutral").length;
  const weak = outcomes.filter((memory) => memory.outcomeRating === "weak").length;
  const sampleSize = outcomes.length;

  if (sampleSize < 3) return { sampleSize, positive, neutral, weak, suggestedConfidence: null, note: null };

  const positiveRate = positive / sampleSize;
  const weakRate = weak / sampleSize;
  const suggestedConfidence: ProposalConfidence = weakRate >= 0.5
    ? "low"
    : positiveRate >= 2 / 3
      ? "high"
      : "medium";

  return {
    sampleSize,
    positive,
    neutral,
    weak,
    suggestedConfidence,
    note: `Memory check: ${sampleSize} verified ${category} outcomes for this Muse (${positive} positive, ${neutral} neutral, ${weak} weak).`,
  };
}

export function calibrateConfidence(base: ProposalConfidence, memory: MuseMemoryCalibration): ProposalConfidence {
  if (!memory.suggestedConfidence) return base;
  if (memory.suggestedConfidence === "low") return "low";
  if (memory.suggestedConfidence === "high" && base === "medium") return "high";
  return base;
}
