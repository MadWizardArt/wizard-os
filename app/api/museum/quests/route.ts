import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import {
  decodeMuseumQuest,
  encodeMuseumQuest,
  MUSEUM_QUEST_PREFIX,
  parseQuestAssignments,
  projectStatusForQuest,
  type StoredMuseumQuest,
} from "../../../../lib/museum-quest-storage";
import { ProjectType } from "../../../generated/prisma/client";

export const runtime = "nodejs";

type ProjectRecord = {
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
  project: ProjectRecord | null,
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

export async function GET() {
  const records = await prisma.project.findMany({
    where: {
      type: ProjectType.INTERNAL,
      archivedAt: null,
      notes: { startsWith: MUSEUM_QUEST_PREFIX },
    },
    select: { id: true, notes: true, createdAt: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });

  const parsed = records.flatMap((record) => {
    const quest = decodeMuseumQuest(record.notes);
    return quest ? [{ record, quest }] : [];
  });
  const linkedIds = [...new Set(parsed.map((item) => item.quest.linkedProjectId).filter((id): id is string => Boolean(id)))];
  const linkedProjects = linkedIds.length
    ? await prisma.project.findMany({
        where: { id: { in: linkedIds }, archivedAt: null },
        select: { id: true, title: true, type: true, status: true, progress: true, nextAction: true },
      })
    : [];
  const projectById = new Map(linkedProjects.map((project) => [project.id, project]));

  return NextResponse.json(
    parsed.map(({ record, quest }) => serializeQuest(record, quest, quest.linkedProjectId ? projectById.get(quest.linkedProjectId) ?? null : null)),
  );
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const brief = typeof body.brief === "string" ? body.brief.trim() : "";
  const linkedProjectId = typeof body.projectId === "string" && body.projectId.trim() ? body.projectId.trim() : null;
  const assignments = parseQuestAssignments(body.assignments);

  if (!title) return NextResponse.json({ error: "Quest title is required." }, { status: 400 });
  if (title.length > 120) return NextResponse.json({ error: "Quest title must be 120 characters or fewer." }, { status: 400 });
  if (brief.length > 2500) return NextResponse.json({ error: "Quest brief must be 2,500 characters or fewer." }, { status: 400 });
  if (!assignments) return NextResponse.json({ error: "Choose exactly one lead Muse and up to two additional Muses." }, { status: 400 });

  let linkedProject: ProjectRecord | null = null;
  if (linkedProjectId) {
    linkedProject = await prisma.project.findFirst({
      where: { id: linkedProjectId, archivedAt: null },
      select: { id: true, title: true, type: true, status: true, progress: true, nextAction: true },
    });
    if (!linkedProject) return NextResponse.json({ error: "The linked Wizard OS project could not be found." }, { status: 400 });
  }

  const quest: StoredMuseumQuest = {
    version: 3,
    title,
    brief,
    status: "ACTIVE",
    linkedProjectId,
    assignments,
    events: [],
  };

  const record = await prisma.project.create({
    data: {
      title: `Museum Quest · ${title}`,
      type: ProjectType.INTERNAL,
      status: projectStatusForQuest(quest.status),
      progress: 0,
      nextAction: "Review in The Museum",
      notes: encodeMuseumQuest(quest),
    },
    select: { id: true, createdAt: true, updatedAt: true },
  });

  return NextResponse.json(serializeQuest(record, quest, linkedProject), { status: 201 });
}
