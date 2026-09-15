import { Prisma } from "../app/generated/prisma/client";
import type { MuseId } from "./museum";
import { calibrateConfidence, readMuseMemoryCalibration } from "./museum-agent-memory";
import { readSharedCategoryContext } from "./museum-agent-cognition";
import {
  decodeMuseProposal,
  encodeMuseProposal,
  type ProposalCategory,
  type ProposalConfidence,
  type ProposalEffort,
  type StoredMuseProposal,
} from "./museum-proposal-storage";

export type MuseProposalInput = {
  museId: MuseId;
  title: string;
  summary: string;
  rationale: string;
  category: ProposalCategory;
  confidence?: ProposalConfidence;
  effort?: ProposalEffort;
  expectedValue: string;
  sourceKey: string;
  relatedProjectId?: string | null;
  createdAt?: Date;
};

type ProposalDb = Pick<Prisma.TransactionClient, "project" | "museumProposal">;

export async function proposeMuseOpportunity(db: ProposalDb, input: MuseProposalInput) {
  const sourceKey = input.sourceKey.trim().slice(0, 240);
  if (!sourceKey) throw new Error("Muse proposal requires a source key.");

  const existing = await db.museumProposal.findUnique({
    where: { sourceKey },
    select: { id: true, payload: true },
  });

  if (existing) {
    const decoded = decodeMuseProposal(existing.payload);
    if (decoded?.sourceKey === sourceKey) return { id: existing.id, proposal: decoded, created: false };
  }

  const baseConfidence = input.confidence ?? "medium";
  const memory = await readMuseMemoryCalibration(db, input.museId, input.category);
  const sharedContext = await readSharedCategoryContext(db, input.museId, input.category);
  const confidence = calibrateConfidence(baseConfidence, memory);
  const rationale = [
    input.rationale.trim(),
    memory.note,
    sharedContext,
  ].filter(Boolean).join("\n\n").slice(0, 1200);

  const proposal: StoredMuseProposal = {
    version: 1,
    museId: input.museId,
    title: input.title.trim().slice(0, 160),
    summary: input.summary.trim().slice(0, 800),
    rationale,
    category: input.category,
    confidence,
    effort: input.effort ?? "medium",
    expectedValue: input.expectedValue.trim().slice(0, 300),
    sourceKey,
    relatedProjectId: input.relatedProjectId?.trim().slice(0, 120) || null,
    status: "proposed",
    createdAt: (input.createdAt ?? new Date()).toISOString(),
    decidedAt: null,
    decisionNote: null,
  };

  if (!proposal.title || !proposal.summary || !proposal.rationale || !proposal.expectedValue) {
    throw new Error("Muse proposal is missing required content.");
  }

  const record = await db.museumProposal.create({
    data: {
      payload: encodeMuseProposal(proposal),
      sourceKey: proposal.sourceKey,
      museId: proposal.museId,
      category: proposal.category,
      status: proposal.status,
      createdAt: new Date(proposal.createdAt),
    },
    select: { id: true },
  });

  return { id: record.id, proposal, created: true };
}