import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../../../../lib/prisma";
import { isMuseId } from "../../../../../../../../lib/museum";
import {
  decodeMuseumQuest,
  encodeMuseumQuest,
  MUSEUM_QUEST_PREFIX,
  setMuseResponseApproval,
  type StoredMuseumQuest,
} from "../../../../../../../../lib/museum-quest-storage";
import { ProjectType } from "../../../../../../../generated/prisma/client";

export const runtime = "nodejs";

type LinkedProject = {
  id: string;
  title: string;
  type: string;
  status: string;
  progress: number;
  nextAction: string | null;
};

function serializeQuest(
  record: { id: string; createdAt: Date; updatedAt: Date },
  quest: StoredMuseumQuest,
  project: LinkedProject | null,
) {
  return {
    id: record.id,
    title: quest.title,
    brief: quest.brief,
    status: quest.status,
    projectId: quest.linkedProjectId,
    project,
    assignments: quest.assignments.map((assignment, index) => ({
      id: `${record.id}:${index}`,
      museId: assignment.museId,
      role: assignment.role,
      note: assignment.note,
      createdAt: record.createdAt,
    })),
    events: quest.events,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; eventId: string }> },
) {
  const { id, eventId } = await context.params;
  const body = await request.json();
  const decision = body.decision === "APPROVE" || body.decision === "REJECT" ? body.decision : null;

  if (!decision) return NextResponse.json({ error: "Choose APPROVE or REJECT." }, { status: 400 });
  if (!isMuseId(body.museId)) return NextResponse.json({ error: "Choose a valid Muse response." }, { status: 400 });

  const record = await prisma.project.findFirst({
    where: {
      id,
      type: ProjectType.INTERNAL,
      archivedAt: null,
      notes: { startsWith: MUSEUM_QUEST_PREFIX },
    },
    select: { id: true, notes: true, createdAt: true, updatedAt: true },
  });
  if (!record) return NextResponse.json({ error: "Quest not found." }, { status: 404 });

  const quest = decodeMuseumQuest(record.notes);
  if (!quest) return NextResponse.json({ error: "Quest record is unreadable." }, { status: 409 });

  const event = quest.events.find((item) => item.id === eventId);
  const response = event?.responses.find((item) => item.museId === body.museId);
  if (!event || !response) return NextResponse.json({ error: "Muse proposal not found." }, { status: 404 });
  if (!response.recommendedNextAction) return NextResponse.json({ error: "This response does not contain an approval-gated proposal." }, { status: 400 });
  if (response.approvalStatus !== "PENDING") {
    return NextResponse.json({ error: `This proposal is already ${response.approvalStatus.toLowerCase()}.` }, { status: 409 });
  }

  if (decision === "REJECT") {
    const rejected = setMuseResponseApproval(quest, eventId, body.museId, "REJECTED");
    if ("error" in rejected) return NextResponse.json({ error: rejected.error }, { status: 400 });

    const updatedRecord = await prisma.project.update({
      where: { id },
      data: { notes: encodeMuseumQuest(rejected.quest) },
      select: { id: true, createdAt: true, updatedAt: true },
    });
    const linkedProject = rejected.quest.linkedProjectId
      ? await prisma.project.findFirst({
          where: { id: rejected.quest.linkedProjectId, archivedAt: null },
          select: { id: true, title: true, type: true, status: true, progress: true, nextAction: true },
        })
      : null;

    return NextResponse.json(serializeQuest(updatedRecord, rejected.quest, linkedProject));
  }

  if (!quest.linkedProjectId) {
    const approved = setMuseResponseApproval(quest, eventId, body.museId, "APPROVED");
    if ("error" in approved) return NextResponse.json({ error: approved.error }, { status: 400 });

    const updatedRecord = await prisma.project.update({
      where: { id },
      data: { notes: encodeMuseumQuest(approved.quest) },
      select: { id: true, createdAt: true, updatedAt: true },
    });
    return NextResponse.json(serializeQuest(updatedRecord, approved.quest, null));
  }

  const linkedProject = await prisma.project.findFirst({
    where: { id: quest.linkedProjectId, archivedAt: null },
    select: { id: true, title: true, type: true, status: true, progress: true, nextAction: true },
  });
  if (!linkedProject) {
    return NextResponse.json({ error: "The linked Wizard OS project is no longer available, so the proposal cannot be applied." }, { status: 409 });
  }

  const applied = setMuseResponseApproval(quest, eventId, body.museId, "APPLIED");
  if ("error" in applied) return NextResponse.json({ error: applied.error }, { status: 400 });

  const result = await prisma.$transaction(async (tx) => {
    const project = await tx.project.update({
      where: { id: linkedProject.id },
      data: { nextAction: response.recommendedNextAction },
      select: { id: true, title: true, type: true, status: true, progress: true, nextAction: true },
    });
    const questRecord = await tx.project.update({
      where: { id },
      data: { notes: encodeMuseumQuest(applied.quest) },
      select: { id: true, createdAt: true, updatedAt: true },
    });
    return { project, questRecord };
  });

  return NextResponse.json(serializeQuest(result.questRecord, applied.quest, result.project));
}
