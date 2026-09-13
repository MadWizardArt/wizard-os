import { NextRequest, NextResponse } from "next/server";
import { generateMuseResponses } from "../../../../../../lib/museum-agent";
import { prisma } from "../../../../../../lib/prisma";
import { isMuseId } from "../../../../../../lib/museum";
import {
  applyMuseAction,
  attachMuseResponses,
  decodeMuseumQuest,
  encodeMuseumQuest,
  isMuseActionType,
  MUSEUM_QUEST_PREFIX,
  projectStatusForQuest,
} from "../../../../../../lib/museum-quest-storage";
import { ProjectType } from "../../../../../generated/prisma/client";

export const runtime = "nodejs";
export const maxDuration = 60;

type LinkedProject = {
  id: string;
  title: string;
  type: string;
  status: string;
  progress: number;
  nextAction: string | null;
};

async function linkedProject(projectId: string | null): Promise<LinkedProject | null> {
  if (!projectId) return null;
  return prisma.project.findFirst({
    where: { id: projectId, archivedAt: null },
    select: { id: true, title: true, type: true, status: true, progress: true, nextAction: true },
  });
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json();

  if (!isMuseActionType(body.type)) return NextResponse.json({ error: "Choose a valid Museum action." }, { status: 400 });
  if (!isMuseId(body.actorMuseId)) return NextResponse.json({ error: "Choose the acting Muse." }, { status: 400 });
  const targetMuseId = body.targetMuseId === null || body.targetMuseId === "" || body.targetMuseId === undefined
    ? null
    : isMuseId(body.targetMuseId) ? body.targetMuseId : undefined;
  if (targetMuseId === undefined) return NextResponse.json({ error: "Choose a valid target Muse." }, { status: 400 });
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (message.length > 1200) return NextResponse.json({ error: "Museum action notes must be 1,200 characters or fewer." }, { status: 400 });

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
  if (current.status === "COMPLETE" || current.status === "ARCHIVED") {
    return NextResponse.json({ error: "Reopen this quest before recording new Muse actions." }, { status: 409 });
  }

  const applied = applyMuseAction(current, { type: body.type, actorMuseId: body.actorMuseId, targetMuseId, message });
  if ("error" in applied) return NextResponse.json({ error: applied.error }, { status: 400 });

  const project = await linkedProject(applied.quest.linkedProjectId);
  const responses = await generateMuseResponses(applied.quest, applied.event, project);
  const next = attachMuseResponses(applied.quest, applied.event.id, responses);

  const updated = await prisma.project.update({
    where: { id },
    data: {
      status: projectStatusForQuest(next.status),
      progress: next.status === "REVIEW" ? 90 : 0,
      nextAction: next.status === "REVIEW" ? "Review Museum quest" : next.status === "WAITING" ? "Await Museum decision" : "Continue Museum quest",
      notes: encodeMuseumQuest(next),
    },
    select: { id: true, createdAt: true, updatedAt: true },
  });

  return NextResponse.json({
    id: updated.id,
    title: next.title,
    brief: next.brief,
    status: next.status,
    projectId: next.linkedProjectId,
    project,
    assignments: next.assignments.map((assignment, index) => ({
      id: `${updated.id}:${index}`,
      museId: assignment.museId,
      role: assignment.role,
      note: assignment.note,
      createdAt: updated.createdAt,
    })),
    events: next.events,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  });
}
