import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { isMuseId } from "../../../../../lib/museum";
import { MuseAssignmentRole, MuseumQuestStatus } from "../../../../generated/prisma/client";

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

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json();
  const existing = await prisma.museumQuest.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Quest not found." }, { status: 404 });

  const data: {
    title?: string;
    brief?: string;
    status?: MuseumQuestStatus;
    projectId?: string | null;
  } = {};

  if (body.title !== undefined) {
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title || title.length > 120) return NextResponse.json({ error: "Quest title must be between 1 and 120 characters." }, { status: 400 });
    data.title = title;
  }

  if (body.brief !== undefined) {
    const brief = typeof body.brief === "string" ? body.brief.trim() : "";
    if (brief.length > 2500) return NextResponse.json({ error: "Quest brief must be 2,500 characters or fewer." }, { status: 400 });
    data.brief = brief;
  }

  if (body.status !== undefined) {
    if (typeof body.status !== "string" || !Object.values(MuseumQuestStatus).includes(body.status as MuseumQuestStatus)) {
      return NextResponse.json({ error: "Choose a valid quest status." }, { status: 400 });
    }
    data.status = body.status as MuseumQuestStatus;
  }

  if (body.projectId !== undefined) {
    const projectId = typeof body.projectId === "string" && body.projectId.trim() ? body.projectId.trim() : null;
    if (projectId) {
      const project = await prisma.project.findFirst({ where: { id: projectId, archivedAt: null }, select: { id: true } });
      if (!project) return NextResponse.json({ error: "The linked Wizard OS project could not be found." }, { status: 400 });
    }
    data.projectId = projectId;
  }

  const assignments = body.assignments === undefined ? undefined : parseAssignments(body.assignments);
  if (body.assignments !== undefined && !assignments) {
    return NextResponse.json({ error: "Choose exactly one lead Muse and up to two additional Muses." }, { status: 400 });
  }

  const quest = await prisma.$transaction(async (tx) => {
    if (assignments) await tx.museAssignment.deleteMany({ where: { questId: id } });
    return tx.museumQuest.update({
      where: { id },
      data: {
        ...data,
        ...(assignments
          ? {
              assignments: {
                create: assignments.map((assignment) => ({
                  museId: assignment.museId,
                  role: assignment.role,
                  note: assignment.note ?? "",
                })),
              },
            }
          : {}),
      },
      include: {
        assignments: { orderBy: { createdAt: "asc" } },
        project: { select: { id: true, title: true, type: true, status: true, progress: true, nextAction: true } },
      },
    });
  });

  return NextResponse.json(quest);
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const existing = await prisma.museumQuest.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Quest not found." }, { status: 404 });

  await prisma.museumQuest.update({ where: { id }, data: { status: MuseumQuestStatus.ARCHIVED } });
  return NextResponse.json({ ok: true });
}
