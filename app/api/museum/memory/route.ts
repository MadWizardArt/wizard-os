import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { isMuseId } from "../../../../lib/museum";
import { recordMuseMemory } from "../../../../lib/museum-agent-memory";
import { decodeMuseMemory, MUSEUM_MEMORY_PREFIX, type MuseOutcomeRating } from "../../../../lib/museum-memory-storage";
import { decodeMuseProposal, MUSEUM_PROPOSAL_PREFIX } from "../../../../lib/museum-proposal-storage";
import { ProjectType } from "../../../generated/prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATINGS = new Set<MuseOutcomeRating>(["strong", "useful", "neutral", "weak"]);

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function GET(request: NextRequest) {
  const museParam = request.nextUrl.searchParams.get("muse");
  const museId = museParam && isMuseId(museParam) ? museParam : null;

  const records = await prisma.project.findMany({
    where: {
      type: ProjectType.INTERNAL,
      notes: { startsWith: MUSEUM_MEMORY_PREFIX },
    },
    select: { id: true, notes: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 180,
  });

  const memories = records
    .map((record) => {
      const memory = decodeMuseMemory(record.notes);
      return memory ? { id: record.id, ...memory } : null;
    })
    .filter((memory): memory is NonNullable<typeof memory> => Boolean(memory))
    .filter((memory) => !museId || memory.museId === museId)
    .slice(0, museId ? 60 : 140);

  return NextResponse.json(memories);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const proposalId = text(body.proposalId, 120);
  const rating = RATINGS.has(body.outcomeRating as MuseOutcomeRating) ? body.outcomeRating as MuseOutcomeRating : null;
  const outcomeNote = text(body.outcomeNote, 1000);
  const actualValue = text(body.actualValue, 300) || null;

  if (!proposalId || !rating) {
    return NextResponse.json({ error: "Choose a completed proposal and an outcome rating." }, { status: 400 });
  }

  const record = await prisma.project.findFirst({
    where: {
      id: proposalId,
      type: ProjectType.INTERNAL,
      notes: { startsWith: MUSEUM_PROPOSAL_PREFIX },
    },
    select: { id: true, notes: true },
  });
  const proposal = record ? decodeMuseProposal(record.notes) : null;
  if (!record || !proposal) return NextResponse.json({ error: "Muse proposal not found." }, { status: 404 });
  if (proposal.status !== "completed") {
    return NextResponse.json({ error: "Record an outcome after execution is complete." }, { status: 409 });
  }

  const summary = outcomeNote || `Brandon rated the completed result as ${rating}.`;
  const result = await prisma.$transaction(async (tx) => recordMuseMemory(tx, {
    museId: proposal.museId,
    kind: "outcome",
    title: `Outcome · ${proposal.title}`,
    summary,
    category: proposal.category,
    sourceKey: `proposal:${proposalId}:outcome`,
    sourceProposalId: proposalId,
    outcomeRating: rating,
    actualValue,
    verifiedBy: "artist",
  }));

  return NextResponse.json({ id: result.id, ...result.memory }, { status: result.created ? 201 : 200 });
}
