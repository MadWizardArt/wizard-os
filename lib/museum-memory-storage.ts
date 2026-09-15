import { isMuseId, type MuseId } from "./museum";
import type { ProposalCategory } from "./museum-proposal-storage";

export const MUSEUM_MEMORY_PREFIX = "MUSEUM_MEMORY_V1:";

export type MuseMemoryKind = "decision" | "outcome" | "lesson";
export type MuseOutcomeRating = "strong" | "useful" | "neutral" | "weak";
export type MuseMemoryVerifiedBy = "artist" | "system";

export type StoredMuseMemory = {
  version: 1;
  museId: MuseId;
  kind: MuseMemoryKind;
  title: string;
  summary: string;
  category: ProposalCategory;
  sourceKey: string;
  sourceProposalId: string | null;
  outcomeRating: MuseOutcomeRating | null;
  actualValue: string | null;
  verifiedBy: MuseMemoryVerifiedBy;
  createdAt: string;
};

const KINDS = new Set<MuseMemoryKind>(["decision", "outcome", "lesson"]);
const RATINGS = new Set<MuseOutcomeRating>(["strong", "useful", "neutral", "weak"]);
const VERIFIED_BY = new Set<MuseMemoryVerifiedBy>(["artist", "system"]);
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

export function encodeMuseMemory(memory: StoredMuseMemory) {
  return `${MUSEUM_MEMORY_PREFIX}${JSON.stringify(memory)}`;
}

export function decodeMuseMemory(notes: string | null): StoredMuseMemory | null {
  if (!notes?.startsWith(MUSEUM_MEMORY_PREFIX)) return null;
  try {
    const parsed = JSON.parse(notes.slice(MUSEUM_MEMORY_PREFIX.length)) as Record<string, unknown>;
    if (Number(parsed.version) !== 1 || !isMuseId(parsed.museId)) return null;
    if (!KINDS.has(parsed.kind as MuseMemoryKind)) return null;
    if (!CATEGORIES.has(parsed.category as ProposalCategory)) return null;
    if (!VERIFIED_BY.has(parsed.verifiedBy as MuseMemoryVerifiedBy)) return null;

    const outcomeRating = parsed.outcomeRating == null
      ? null
      : RATINGS.has(parsed.outcomeRating as MuseOutcomeRating)
        ? parsed.outcomeRating as MuseOutcomeRating
        : null;
    const title = text(parsed.title, 180);
    const summary = text(parsed.summary, 1200);
    const sourceKey = text(parsed.sourceKey, 260);
    const createdAt = iso(parsed.createdAt);
    if (!title || !summary || !sourceKey || !createdAt) return null;

    return {
      version: 1,
      museId: parsed.museId,
      kind: parsed.kind as MuseMemoryKind,
      title,
      summary,
      category: parsed.category as ProposalCategory,
      sourceKey,
      sourceProposalId: nullableText(parsed.sourceProposalId, 120),
      outcomeRating,
      actualValue: nullableText(parsed.actualValue, 300),
      verifiedBy: parsed.verifiedBy as MuseMemoryVerifiedBy,
      createdAt,
    };
  } catch {
    return null;
  }
}
