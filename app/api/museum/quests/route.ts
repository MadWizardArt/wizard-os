import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { isMuseId } from "../../../../lib/museum";
import { MuseAssignmentRole, MuseumQuestStatus } from "../../../generated/prisma/client";

export const runtime = "nodejs";

type AssignmentInput = { museId: string; role: MuseAssignmentRole; note?: string };

function parseAssignments(value: unknown): AssignmentInput[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 3) return null;

  const parsed: AssignmentInput[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const record = item as Record<string, unknown>;
    if (!isMuseId(record.museId) || seen.has(record.museId)) return null;
    if (typeof record.role !== "string" || !Object.values(MuseAssignmentRole).includes(record.role as MuseAssignmentRole)) return null;
    seen.add(record.museId);
    parsed.push({
      museId: record.museId,
      role: record.role as MuseAssignmentRole,
      note: typeof record.note === "string" ? record.note.trim().slice(0, 500) : "",
    });
  }

  return parsed.filter((assignment) => assignment.role === MuseAssignmentRole.LEAD).length === 1 ? parsed : null;
}

export async function GET() {
  const quests = await prisma.museumQuest.findMany({
    where: { status: { not: MuseumQuestStatus.ARCHIVED } },
    include: {
      assignments: { orderBy: { createdAt: "asc" } },
      project: { select: { id: true, title: true, type: true, status: true, progress: true, nextAction: true } },
    },
    orderBy: [{ updatedAt: "desc" }],
  });

  return NextResponse.json(quests);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const brief = typeof body.brief === "string" ? body.brief.trim() : "";
  const projectId = typeof body.projectId === "string" && body.projectId.trim() ? body.projectId.trim() : null;
  const assignments = parseAssignments(body.assignments);

  if (!title) return NextResponse.json({ error: "Quest title is required." }, { status: 400 });
  if (title.length > 120) return NextResponse.json({ error: "Quest title must be 120 characters or fewer." }, { status: 400 });
  if (brief.length > 2500) return NextResponse.json({ error: "Quest brief must be 2,500 characters or fewer." }, { status: 400 });
  if (!assignments) return NextResponse.json({ error: "Choose exactly one lead Muse and up to two additional Muses." }, { status: 400 });

  if (projectId) {
    const project = await prisma.project.findFirst({ where: { id: projectId, archivedAt: null }, select: { id: true } });
    if (!project) return NextResponse.json({ error: "The linked Wizard OS project could not be found." }, { status: 400 });
  }

  const quest = await prisma.museumQuest.create({
    data: {
      title,
      brief,
      status: MuseumQuestStatus.ACTIVE,
      projectId,
      assignments: {
        create: assignments.map((assignment) => ({
          museId: assignment.museId,
          role: assignment.role,
          note: assignment.note ?? "",
        })),
      },
    },
    include: {
      assignments: { orderBy: { createdAt: "asc" } },
      project: { select: { id: true, title: true, type: true, status: true, progress: true, nextAction: true } },
    },
  });

  return NextResponse.json(quest, { status: 201 });
}
