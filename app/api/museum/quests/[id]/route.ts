import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import {
  decodeMuseumQuest,
  encodeMuseumQuest,
  isQuestStatus,
  MUSEUM_QUEST_PREFIX,
  parseQuestAssignments,
  projectStatusForQuest,
  type StoredMuseumQuest,
} from "../../../../../lib/museum-quest-storage";
import { ProjectType } from "../../../../generated/prisma/client";

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

async function linkedProject(projectId: string | null): Promise<LinkedProject | null> {
  if (!projectId) return null;
  return prisma.project.findFirst({
    where: { id: projectId, archivedAt: null },
    select: { id: true, title: true, type: true, status: true, progress: true, nextAction: true },
  });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json();
  const existing = await prisma.project.findFirst({
    where: {
      id,
      type: ProjectType.INTERNAL,
      archivedAt: null,
      notes: { startsWith: MUSEUM_QUEST_PREFIX },
    },
    select: { id: true, notes: true, createdAt: true, updatedAt: true },
  });
  if (!existing) return NextResponse.json({ error: "Quest not found." }, { status: 404 });

  const current = decodeMuseumQuest(existing.notes);
  if (!current) return NextResponse.json({ error: "Quest record is unreadable." }, { status: 409 });
  const next: StoredMuseumQuest = { ...current, assignments: [...current.assignments], events: [...current.events] };

  if (body.title !== undefined) {
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title || title.length > 120) return NextResponse.json({ error: "Quest title must be between 1 and 120 characters." }, { status: 400 });
    next.title = title;
  }

  if (body.brief !== undefined) {
    const brief = typeof body.brief === "string" ? body.brief.trim() : "";
    if (brief.length > 2500) return NextResponse.json({ error: "Quest brief must be 2,500 characters or fewer." }, { status: 400 });
    next.brief = brief;
  }

  if (body.status !== undefined) {
    if (!isQuestStatus(body.status)) return NextResponse.json({ error: "Choose a valid quest status." }, { status: 400 });
    next.status = body.status;
  }

  if (body.projectId !== undefined) {
    const projectId = typeof body.projectId === "string" && body.projectId.trim() ? body.projectId.trim() : null;
    if (projectId && !(await linkedProject(projectId))) {
      return NextResponse.json({ error: "The linked Wizard OS project could not be found." }, { status: 400 });
    }
    next.linkedProjectId = projectId;
  }

  if (body.assignments !== undefined) {
    const assignments = parseQuestAssignments(body.assignments);
    if (!assignments) return NextResponse.json({ error: "Choose exactly one lead Muse and up to two additional Muses." }, { status: 400 });
    next.assignments = assignments;
  }

  const updated = await prisma.project.update({
    where: { id },
    data: {
      title: `Museum Quest · ${next.title}`,
      status: projectStatusForQuest(next.status),
      progress: next.status === "COMPLETE" ? 100 : next.status === "REVIEW" ? 90 : 0,
      nextAction: next.status === "REVIEW" ? "Review Museum quest" : next.status === "WAITING" ? "Await Museum decision" : next.status === "COMPLETE" ? "Quest complete" : "Review in The Museum",
      notes: encodeMuseumQuest(next),
      archivedAt: next.status === "ARCHIVED" ? new Date() : null,
    },
    select: { id: true, createdAt: true, updatedAt: true },
  });

  return NextResponse.json(serializeQuest(updated, next, await linkedProject(next.linkedProjectId)));
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const existing = await prisma.project.findFirst({
    where: { id, type: ProjectType.INTERNAL, notes: { startsWith: MUSEUM_QUEST_PREFIX } },
    select: { id: true, notes: true },
  });
  if (!existing) return NextResponse.json({ error: "Quest not found." }, { status: 404 });

  const current = decodeMuseumQuest(existing.notes);
  if (!current) return NextResponse.json({ error: "Quest record is unreadable." }, { status: 409 });
  const archived: StoredMuseumQuest = { ...current, status: "ARCHIVED" };

  await prisma.project.update({
    where: { id },
    data: {
      status: projectStatusForQuest("ARCHIVED"),
      notes: encodeMuseumQuest(archived),
      archivedAt: new Date(),
    },
  });
  return NextResponse.json({ ok: true });
}
