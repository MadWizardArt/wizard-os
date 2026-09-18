import { isMuseId, type MuseId } from "./museum";
import type { ProposalCategory } from "./museum-proposal-storage";

export const MUSEUM_WORKING_STATE_PREFIX = "MUSEUM_WORKING_STATE_V1:";

export type MuseWorkingStateStatus = "active" | "waiting" | "blocked" | "complete" | "superseded";
export type MuseWorkingStateVerification = "unverified" | "artist-confirmed" | "system-verified";

export type StoredMuseWorkingState = {
  version: 1;
  museId: MuseId;
  objective: string;
  category: ProposalCategory;
  sourceKey: string;
  sourceProjectId: string | null;
  status: MuseWorkingStateStatus;
  nextAction: string | null;
  completionCondition: string;
  notes: string | null;
  evidenceRefs: string[];
  verificationStatus: MuseWorkingStateVerification;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  graduatedMemoryId: string | null;
};

const STATUSES = new Set<MuseWorkingStateStatus>(["active", "waiting", "blocked", "complete", "superseded"]);
const VERIFICATION = new Set<MuseWorkingStateVerification>(["unverified", "artist-confirmed", "system-verified"]);
const CATEGORIES = new Set<ProposalCategory>(["revenue", "product", "content", "system", "risk", "research", "capacity", "experiment"]);

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function nullableText(value: unknown, max: number) {
  const cleaned = text(value, max);
  return cleaned || null;
}

function iso(value: unknown) {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function refs(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().slice(0, 300))
    .filter(Boolean)
    .slice(0, 12);
}

export function encodeMuseWorkingState(state: StoredMuseWorkingState) {
  return `${MUSEUM_WORKING_STATE_PREFIX}${JSON.stringify(state)}`;
}

export function decodeMuseWorkingState(notes: string | null): StoredMuseWorkingState | null {
  if (!notes?.startsWith(MUSEUM_WORKING_STATE_PREFIX)) return null;
  try {
    const parsed = JSON.parse(notes.slice(MUSEUM_WORKING_STATE_PREFIX.length)) as Record<string, unknown>;
    if (Number(parsed.version) !== 1 || !isMuseId(parsed.museId)) return null;
    if (!STATUSES.has(parsed.status as MuseWorkingStateStatus)) return null;
    if (!VERIFICATION.has(parsed.verificationStatus as MuseWorkingStateVerification)) return null;
    if (!CATEGORIES.has(parsed.category as ProposalCategory)) return null;

    const objective = text(parsed.objective, 240);
    const sourceKey = text(parsed.sourceKey, 260);
    const completionCondition = text(parsed.completionCondition, 700);
    const createdAt = iso(parsed.createdAt);
    const updatedAt = iso(parsed.updatedAt);
    if (!objective || !sourceKey || !completionCondition || !createdAt || !updatedAt) return null;

    return {
      version: 1,
      museId: parsed.museId,
      objective,
      category: parsed.category as ProposalCategory,
      sourceKey,
      sourceProjectId: nullableText(parsed.sourceProjectId, 120),
      status: parsed.status as MuseWorkingStateStatus,
      nextAction: nullableText(parsed.nextAction, 700),
      completionCondition,
      notes: nullableText(parsed.notes, 1400),
      evidenceRefs: refs(parsed.evidenceRefs),
      verificationStatus: parsed.verificationStatus as MuseWorkingStateVerification,
      verifiedAt: iso(parsed.verifiedAt),
      createdAt,
      updatedAt,
      completedAt: iso(parsed.completedAt),
      graduatedMemoryId: nullableText(parsed.graduatedMemoryId, 120),
    };
  } catch {
    return null;
  }
}

export function canGraduateMuseWorkingState(state: StoredMuseWorkingState) {
  if (state.status !== "complete") return { allowed: false, reason: "Working state must be complete before it can become durable memory." };
  if (state.verificationStatus === "unverified" || !state.verifiedAt) return { allowed: false, reason: "Working state must be explicitly verified before graduation." };
  if (state.evidenceRefs.length === 0) return { allowed: false, reason: "Graduation requires at least one evidence reference." };
  if (state.graduatedMemoryId) return { allowed: false, reason: "This working state already graduated into durable memory." };
  return { allowed: true, reason: null };
}

export function isMuseWorkingStateProject(notes: string | null) {
  return Boolean(notes?.startsWith(MUSEUM_WORKING_STATE_PREFIX));
}

