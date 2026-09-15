import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { isMuseId } from "../../../../lib/museum";
import { recordMuseMemory } from "../../../../lib/museum-agent-memory";
import { proposeMuseOpportunity } from "../../../../lib/museum-agent-proposals";
import {
  decodeMuseProposal,
  encodeMuseProposal,
  type ProposalCategory,
  type ProposalConfidence,
  type ProposalEffort,
  type StoredMuseProposal,
} from "../../../../lib/museum-proposal-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CATEGORIES = new Set<ProposalCategory>(["revenue", "product", "content", "system", "risk", "research", "capacity", "experiment"]);
const CONFIDENCE = new Set<ProposalConfidence>(["low", "medium", "high"]);
const EFFORT = new Set<ProposalEffort>(["small", "medium", "large"]);

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function GET(request: NextRequest) {
  const museParam = request.nextUrl.searchParams.get("muse");
  const museId = museParam && isMuseId(museParam) ? museParam : null;
  const statusParam = request.nextUrl.searchParams.get("status");

  const records = await prisma.museumProposal.findMany({
    where: {
      ...(museId ? { museId } : {}),
      ...(statusParam ? { status: statusParam } : {}),
    },
    select: { id: true, payload: true },
    orderBy: { createdAt: "desc" },
    take: museId ? 30 : 60,
  });

  const proposals = records
    .map((record) => {
      const proposal = decodeMuseProposal(record.payload);
      return proposal ? { id: record.id, ...proposal } : null;
    })
    .filter((proposal): proposal is NonNullable<typeof proposal> => Boolean(proposal));

  return NextResponse.json(proposals);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  if (!isMuseId(body.museId)) return NextResponse.json({ error: "Choose a valid Muse." }, { status: 400 });

  const title = text(body.title, 160);
  const summary = text(body.summary, 800);
  const rationale = text(body.rationale, 1200);
  const expectedValue = text(body.expectedValue, 300);
  const sourceKey = text(body.sourceKey, 240) || `manual:${body.museId}:${Date.now()}`;
  const relatedProjectId = text(body.relatedProjectId, 120) || null;
  const category = CATEGORIES.has(body.category as ProposalCategory) ? body.category as ProposalCategory : "experiment";
  const confidence = CONFIDENCE.has(body.confidence as ProposalConfidence) ? body.confidence as ProposalConfidence : "medium";
  const effort = EFFORT.has(body.effort as ProposalEffort) ? body.effort as ProposalEffort : "medium";

  if (!title || !summary || !rationale || !expectedValue) {
    return NextResponse.json({ error: "Title, summary, rationale, and expected value are required." }, { status: 400 });
  }

  const result = await prisma.$transaction(async (tx) => proposeMuseOpportunity(tx, {
    museId: body.museId,
    title,
    summary,
    rationale,
    category,
    confidence,
    effort,
    expectedValue,
    sourceKey,
    relatedProjectId,
  }));

  return NextResponse.json({ id: result.id, ...result.proposal }, { status: result.created ? 201 : 200 });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const id = text(body.id, 120);
  const action = body.action === "approve" || body.action === "reject" || body.action === "complete" ? body.action : null;
  const decisionNote = text(body.decisionNote, 600) || null;
  if (!id || !action) return NextResponse.json({ error: "Choose a proposal and decision." }, { status: 400 });

  const record = await prisma.museumProposal.findUnique({
    where: { id },
    select: { id: true, payload: true },
  });
  const proposal = record ? decodeMuseProposal(record.payload) : null;
  if (!record || !proposal) return NextResponse.json({ error: "Muse proposal not found." }, { status: 404 });

  const now = new Date().toISOString();
  const status = action === "approve" ? "approved" : action === "reject" ? "rejected" : "completed";
  const updated: StoredMuseProposal = {
    ...proposal,
    status,
    decidedAt: action === "complete" ? proposal.decidedAt ?? now : now,
    decisionNote: decisionNote ?? proposal.decisionNote,
  };

  await prisma.$transaction(async (tx) => {
    await tx.museumProposal.update({
      where: { id: record.id },
      data: {
        payload: encodeMuseProposal(updated),
        status: updated.status,
      },
    });

    const actionLabel = action === "approve" ? "Approved" : action === "reject" ? "Declined" : "Execution complete";
    const inferenceRule = action === "reject"
      ? "This records the Artist's decision only; no negative performance lesson is inferred."
      : action === "complete"
        ? "Execution is complete; no performance lesson is inferred until the Artist records an outcome."
        : "This records Artist commitment, not proof that the proposal will succeed.";
    const note = decisionNote ? ` Artist note: ${decisionNote}` : "";

    await recordMuseMemory(tx, {
      museId: proposal.museId,
      kind: "decision",
      title: `${actionLabel} · ${proposal.title}`,
      summary: `${actionLabel} by Brandon. ${inferenceRule}${note}`,
      category: proposal.category,
      sourceKey: `proposal:${id}:${action}`,
      sourceProposalId: id,
      verifiedBy: "artist",
    });
  });

  return NextResponse.json({ id: record.id, ...updated });
}