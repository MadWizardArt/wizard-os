import { Prisma, ProjectStatus, ProjectType } from "../app/generated/prisma/client";
import type { MuseId } from "./museum";
import { recordMuseMemory } from "./museum-agent-memory";
import { decodeMuseMemory, MUSEUM_MEMORY_PREFIX, type MuseMemoryKind, type StoredMuseMemory } from "./museum-memory-storage";
import type { ProposalCategory } from "./museum-proposal-storage";
import {
  canGraduateMuseWorkingState,
  decodeMuseWorkingState,
  encodeMuseWorkingState,
  MUSEUM_WORKING_STATE_PREFIX,
  type MuseWorkingStateStatus,
  type MuseWorkingStateVerification,
  type StoredMuseWorkingState,
} from "./museum-working-state-storage";

type ContinuityDb = Pick<Prisma.TransactionClient, "project">;

export type MuseWorkingStateInput = {
  museId: MuseId;
  objective: string;
  category: ProposalCategory;
  sourceKey: string;
  sourceProjectId?: string | null;
  status?: MuseWorkingStateStatus;
  nextAction?: string | null;
  completionCondition: string;
  notes?: string | null;
  evidenceRefs?: string[];
};

export type MuseMindContinuity = {
  museId: MuseId;
  workingStates: Array<{ id: string; state: StoredMuseWorkingState }>;
  durableMemories: Array<{ id: string; memory: StoredMuseMemory }>;
};

function cleanText(value: string | null | undefined, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function normalizeRefs(values: string[] | undefined) {
  return (values ?? []).map((item) => cleanText(item, 300)).filter(Boolean).slice(0, 12);
}

function projectStatusForMuseWorkingState(status: MuseWorkingStateStatus): ProjectStatus {
  if (status === "complete") return ProjectStatus.COMPLETE;
  if (status === "blocked") return ProjectStatus.BLOCKED;
  if (status === "waiting") return ProjectStatus.WAITING;
  if (status === "superseded") return ProjectStatus.ARCHIVED;
  return ProjectStatus.ACTIVE;
}

export async function upsertMuseWorkingState(db: ContinuityDb, input: MuseWorkingStateInput) {
  const sourceKey = cleanText(input.sourceKey, 260);
  const objective = cleanText(input.objective, 240);
  const completionCondition = cleanText(input.completionCondition, 700);
  if (!sourceKey || !objective || !completionCondition) throw new Error("Working state requires sourceKey, objective, and completionCondition.");

  const records = await db.project.findMany({
    where: { type: ProjectType.INTERNAL, notes: { startsWith: MUSEUM_WORKING_STATE_PREFIX, contains: sourceKey } },
    select: { id: true, notes: true },
    orderBy: { updatedAt: "desc" },
    take: 8,
  });
  const existing = records
    .map((record) => ({ id: record.id, state: decodeMuseWorkingState(record.notes) }))
    .find((record) => record.state?.sourceKey === sourceKey && record.state.museId === input.museId);

  const now = new Date().toISOString();
  const status = input.status ?? existing?.state?.status ?? "active";
  const sourceProjectId = cleanText(input.sourceProjectId, 120) || existing?.state?.sourceProjectId || null;
  const notes = cleanText(input.notes, 1400) || null;
  const nextAction = cleanText(input.nextAction, 700) || null;
  const evidenceRefs = normalizeRefs(input.evidenceRefs);
  const preservedEvidence = existing?.state?.evidenceRefs ?? [];
  const substantiveChanged = Boolean(existing?.state) && (
    existing?.state?.objective !== objective
    || existing?.state?.category !== input.category
    || existing?.state?.sourceProjectId !== sourceProjectId
    || existing?.state?.completionCondition !== completionCondition
    || existing?.state?.notes !== notes
    || (existing?.state?.status === "complete" && status !== "complete")
  );

  if (existing?.state?.graduatedMemoryId && substantiveChanged) {
    throw new Error("Graduated working state is immutable. Create a new sourceKey for materially changed work.");
  }

  const state: StoredMuseWorkingState = {
    version: 1,
    museId: input.museId,
    objective,
    category: input.category,
    sourceKey,
    sourceProjectId,
    status,
    nextAction,
    completionCondition,
    notes,
    evidenceRefs: evidenceRefs.length ? evidenceRefs : preservedEvidence,
    verificationStatus: substantiveChanged ? "unverified" : existing?.state?.verificationStatus ?? "unverified",
    verifiedAt: substantiveChanged ? null : existing?.state?.verifiedAt ?? null,
    createdAt: existing?.state?.createdAt ?? now,
    updatedAt: now,
    completedAt: status === "complete" ? existing?.state?.completedAt ?? now : null,
    graduatedMemoryId: existing?.state?.graduatedMemoryId ?? null,
  };

  const data = {
    title: `[Muse Working State] ${state.museId} · ${state.objective}`,
    type: ProjectType.INTERNAL,
    status: projectStatusForMuseWorkingState(state.status),
    progress: state.status === "complete" ? 100 : 0,
    nextAction: state.nextAction,
    notes: encodeMuseWorkingState(state),
    archivedAt: state.status === "superseded" ? new Date(now) : null,
  };

  if (existing?.id) {
    await db.project.update({ where: { id: existing.id }, data });
    return { id: existing.id, state, created: false };
  }

  const record = await db.project.create({ data, select: { id: true } });
  return { id: record.id, state, created: true };
}

export async function verifyMuseWorkingState(
  db: ContinuityDb,
  id: string,
  verificationStatus: Exclude<MuseWorkingStateVerification, "unverified">,
  evidenceRefs: string[],
) {
  const record = await db.project.findUnique({ where: { id }, select: { id: true, notes: true } });
  const state = record ? decodeMuseWorkingState(record.notes) : null;
  if (!record || !state) throw new Error("Muse working state not found.");
  if (state.status !== "complete") throw new Error("Only completed working state can be verified.");

  const refs = normalizeRefs(evidenceRefs);
  if (refs.length === 0) throw new Error("Verification requires at least one evidence reference.");

  const now = new Date().toISOString();
  const updated: StoredMuseWorkingState = {
    ...state,
    evidenceRefs: [...new Set([...state.evidenceRefs, ...refs])].slice(0, 12),
    verificationStatus,
    verifiedAt: now,
    updatedAt: now,
  };
  await db.project.update({
    where: { id },
    data: { notes: encodeMuseWorkingState(updated) },
  });
  return { id, state: updated };
}

export async function graduateMuseWorkingState(db: ContinuityDb, id: string, input: {
  kind?: MuseMemoryKind;
  title?: string | null;
  summary: string;
}) {
  const record = await db.project.findUnique({ where: { id }, select: { id: true, notes: true } });
  const state = record ? decodeMuseWorkingState(record.notes) : null;
  if (!record || !state) throw new Error("Muse working state not found.");

  const eligibility = canGraduateMuseWorkingState(state);
  if (!eligibility.allowed) throw new Error(eligibility.reason || "Working state is not eligible for memory graduation.");

  const summary = cleanText(input.summary, 1200);
  if (!summary) throw new Error("Memory graduation requires an explicit durable lesson summary.");

  const memoryResult = await recordMuseMemory(db, {
    museId: state.museId,
    kind: input.kind ?? "lesson",
    title: cleanText(input.title, 180) || `Lesson · ${state.objective}`,
    summary,
    category: state.category,
    sourceKey: `working-state:${state.sourceKey}:memory`,
    verifiedBy: state.verificationStatus === "artist-confirmed" ? "artist" : "system",
  });

  const now = new Date().toISOString();
  const updated: StoredMuseWorkingState = {
    ...state,
    graduatedMemoryId: memoryResult.id,
    updatedAt: now,
  };
  await db.project.update({ where: { id }, data: { notes: encodeMuseWorkingState(updated) } });
  return { id, state: updated, memory: { id: memoryResult.id, ...memoryResult.memory } };
}

export async function readMuseMindContinuity(db: ContinuityDb, museId: MuseId): Promise<MuseMindContinuity> {
  const [stateRecords, memoryRecords] = await Promise.all([
    db.project.findMany({
      where: { type: ProjectType.INTERNAL, notes: { startsWith: MUSEUM_WORKING_STATE_PREFIX } },
      select: { id: true, notes: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 80,
    }),
    db.project.findMany({
      where: { type: ProjectType.INTERNAL, notes: { startsWith: MUSEUM_MEMORY_PREFIX } },
      select: { id: true, notes: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 180,
    }),
  ]);

  const workingStates = stateRecords
    .map((record) => {
      const state = decodeMuseWorkingState(record.notes);
      return state?.museId === museId ? { id: record.id, state } : null;
    })
    .filter((item): item is { id: string; state: StoredMuseWorkingState } => Boolean(item))
    .slice(0, 12);

  const durableMemories = memoryRecords
    .map((record) => {
      const memory = decodeMuseMemory(record.notes);
      return memory?.museId === museId ? { id: record.id, memory } : null;
    })
    .filter((item): item is { id: string; memory: StoredMuseMemory } => Boolean(item))
    .slice(0, 12);

  return { museId, workingStates, durableMemories };
}

export function formatMuseMindContinuity(continuity: MuseMindContinuity) {
  const active = continuity.workingStates
    .filter(({ state }) => ["active", "waiting", "blocked"].includes(state.status) || (state.status === "complete" && !state.graduatedMemoryId))
    .slice(0, 6);
  const states = active.length
    ? active.map(({ id, state }, index) => {
        const evidence = state.evidenceRefs.length ? state.evidenceRefs.join("; ") : "none";
        return `${index + 1}. [${state.status} | ${state.verificationStatus}] ${state.objective}\nNext: ${state.nextAction ?? "none"}\nCompletion: ${state.completionCondition}\nEvidence refs: ${evidence}\nState ref: ${id}`;
      }).join("\n\n")
    : "No persisted working state for this Muse.";

  const memories = continuity.durableMemories.length
    ? continuity.durableMemories.slice(0, 8).map(({ id, memory }, index) =>
        `${index + 1}. [${memory.kind} | ${memory.category} | verified by ${memory.verifiedBy}] ${memory.title}: ${memory.summary}\nMemory ref: ${id}`
      ).join("\n\n")
    : "No durable personal memory for this Muse yet.";

  return `PERSONAL WORKING STATE\n${states}\n\nDURABLE PERSONAL MEMORY\n${memories}`;
}
