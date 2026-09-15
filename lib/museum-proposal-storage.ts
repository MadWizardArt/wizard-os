import { isMuseId, type MuseId } from "./museum";

export const MUSEUM_PROPOSAL_PREFIX = "MUSEUM_PROPOSAL_V1:";

export type ProposalStatus = "proposed" | "approved" | "rejected" | "completed";
export type ProposalConfidence = "low" | "medium" | "high";
export type ProposalEffort = "small" | "medium" | "large";
export type ProposalCategory = "revenue" | "product" | "content" | "system" | "risk" | "research" | "capacity" | "experiment";

export type StoredMuseProposal = {
  version: 1;
  museId: MuseId;
  title: string;
  summary: string;
  rationale: string;
  category: ProposalCategory;
  confidence: ProposalConfidence;
  effort: ProposalEffort;
  expectedValue: string;
  sourceKey: string;
  relatedProjectId: string | null;
  status: ProposalStatus;
  createdAt: string;
  decidedAt: string | null;
  decisionNote: string | null;
};

const STATUSES = new Set<ProposalStatus>(["proposed", "approved", "rejected", "completed"]);
const CONFIDENCE = new Set<ProposalConfidence>(["low", "medium", "high"]);
const EFFORT = new Set<ProposalEffort>(["small", "medium", "large"]);
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

export function encodeMuseProposal(proposal: StoredMuseProposal) {
  return `${MUSEUM_PROPOSAL_PREFIX}${JSON.stringify(proposal)}`;
}

export function decodeMuseProposal(notes: string | null): StoredMuseProposal | null {
  if (!notes?.startsWith(MUSEUM_PROPOSAL_PREFIX)) return null;
  try {
    const parsed = JSON.parse(notes.slice(MUSEUM_PROPOSAL_PREFIX.length)) as Record<string, unknown>;
    if (Number(parsed.version) !== 1 || !isMuseId(parsed.museId)) return null;
    if (!STATUSES.has(parsed.status as ProposalStatus)) return null;
    if (!CONFIDENCE.has(parsed.confidence as ProposalConfidence)) return null;
    if (!EFFORT.has(parsed.effort as ProposalEffort)) return null;
    if (!CATEGORIES.has(parsed.category as ProposalCategory)) return null;

    const title = text(parsed.title, 160);
    const summary = text(parsed.summary, 800);
    const rationale = text(parsed.rationale, 1200);
    const expectedValue = text(parsed.expectedValue, 300);
    const sourceKey = text(parsed.sourceKey, 240);
    const createdAt = iso(parsed.createdAt);
    if (!title || !summary || !rationale || !expectedValue || !sourceKey || !createdAt) return null;

    return {
      version: 1,
      museId: parsed.museId,
      title,
      summary,
      rationale,
      category: parsed.category as ProposalCategory,
      confidence: parsed.confidence as ProposalConfidence,
      effort: parsed.effort as ProposalEffort,
      expectedValue,
      sourceKey,
      relatedProjectId: nullableText(parsed.relatedProjectId, 120),
      status: parsed.status as ProposalStatus,
      createdAt,
      decidedAt: iso(parsed.decidedAt),
      decisionNote: nullableText(parsed.decisionNote, 600),
    };
  } catch {
    return null;
  }
}
