import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { isMuseId } from "../../../../lib/museum";
import {
  decodeMuseProposal,
  encodeMuseProposal,
  MUSEUM_PROPOSAL_PREFIX,
  type ProposalCategory,
  type ProposalConfidence,
  type ProposalEffort,
  type StoredMuseProposal,
} from "../../../../lib/museum-proposal-storage";
import { ProjectStatus, ProjectType } from "../../../generated/prisma/client";

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

  const records = await prisma.project.findMany({
    where: {
      type: ProjectType.INTERNAL,
      notes: { startsWith: MUSEUM_PROPOSAL_PREFIX },
    },
    select: { id: true, notes: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const proposals = records
    .map((record) => {
      const proposal = decodeMuseProposal(record.notes);
      return proposal ? { id: record.id, ...proposal } : null;
    })
    .filter((proposal): proposal is NonNullable<typeof proposal> => Boolean(proposal))
    .filter((proposal) => !museId || proposal.museId === museId)
    .filter((proposal) => !statusParam || proposal.status === statusParam)
    .slice(0, museId ? 30 : 60);

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

  const existing = await prisma.project.findFirst({
    where: {
      type: ProjectType.INTERNAL,
      notes: { contains: `\"sourceKey\":\"${sourceKey.replaceAll('"', "")}` },
    },
    select: { id: true, notes: true },
  });
  if (existing) {
    const decoded = decodeMuseProposal(existing.notes);
    if (decoded) return NextResponse.json({ id: existing.id, ...decoded }, { status: 200 });
  }

  const proposal: StoredMuseProposal = {
    version: 1,
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
    status: "proposed",
    createdAt: new Date().toISOString(),
    decidedAt: null,
    decisionNote: null,
  };

  const record = await prisma.project.create({
    data: {
      title: `[Muse Proposal] ${title}`,
      type: ProjectType.INTERNAL,
      status: ProjectStatus.WAITING,
      progress: 0,
      nextAction: "Await Artist decision",
      notes: encodeMuseProposal(proposal),
    },
    select: { id: true },
  });

  return NextResponse.json({ id: record.id, ...proposal }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const id = text(body.id, 120);
  const action = body.action === "approve" || body.action === "reject" || body.action === "complete" ? body.action : null;
  const decisionNote = text(body.decisionNote, 600) || null;
  if (!id || !action) return NextResponse.json({ error: "Choose a proposal and decision." }, { status: 400 });

  const record = await prisma.project.findFirst({
    where: {
      id,
      type: ProjectType.INTERNAL,
      notes: { startsWith: MUSEUM_PROPOSAL_PREFIX },
    },
    select: { id: true, notes: true },
  });
  const proposal = record ? decodeMuseProposal(record.notes) : null;
  if (!record || !proposal) return NextResponse.json({ error: "Muse proposal not found." }, { status: 404 });

  const now = new Date().toISOString();
  const status = action === "approve" ? "approved" : action === "reject" ? "rejected" : "completed";
  const updated: StoredMuseProposal = {
    ...proposal,
    status,
    decidedAt: action === "complete" ? proposal.decidedAt ?? now : now,
    decisionNote: decisionNote ?? proposal.decisionNote,
  };

  await prisma.project.update({
    where: { id: record.id },
    data: {
      notes: encodeMuseProposal(updated),
      status: action === "approve" ? ProjectStatus.ACTIVE : action === "reject" ? ProjectStatus.ARCHIVED : ProjectStatus.COMPLETE,
      progress: action === "complete" ? 100 : action === "approve" ? 15 : 0,
      nextAction: action === "approve"
        ? "Artist approved · route to owner for execution"
        : action === "reject"
          ? "Artist declined"
          : "Completed and ready for learning review",
    },
  });

  return NextResponse.json({ id: record.id, ...updated });
}
