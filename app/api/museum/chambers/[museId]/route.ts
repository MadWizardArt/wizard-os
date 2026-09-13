import { NextRequest, NextResponse } from "next/server";
import { generateChamberReply, type ChamberProjectContext, type ChamberQuestContext } from "../../../../../lib/museum-chamber-agent";
import {
  appendMuseMessage,
  appendUserMessage,
  createMuseumChamber,
  decodeMuseumChamber,
  encodeMuseumChamber,
  MUSEUM_CHAMBER_PREFIX,
  type StoredMuseumChamber,
} from "../../../../../lib/museum-chamber-storage";
import { isMuseId, type MuseId } from "../../../../../lib/museum";
import { MUSE_BY_ID } from "../../../../../lib/museum-directory";
import { decodeMuseumQuest, MUSEUM_QUEST_PREFIX } from "../../../../../lib/museum-quest-storage";
import { prisma } from "../../../../../lib/prisma";
import { ProjectStatus, ProjectType } from "../../../../generated/prisma/client";

export const runtime = "nodejs";
export const maxDuration = 60;

type ChamberRecord = {
  id: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function chamberTitle(museId: MuseId) {
  return `Museum Chamber · ${MUSE_BY_ID[museId].name}`;
}

async function findChamber(museId: MuseId): Promise<ChamberRecord | null> {
  const records = await prisma.project.findMany({
    where: {
      type: ProjectType.INTERNAL,
      archivedAt: null,
      notes: { startsWith: MUSEUM_CHAMBER_PREFIX },
    },
    select: { id: true, notes: true, createdAt: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });

  return records.find((record) => decodeMuseumChamber(record.notes)?.museId === museId) ?? null;
}

async function getOrCreateChamber(museId: MuseId): Promise<{ record: ChamberRecord; chamber: StoredMuseumChamber }> {
  const existing = await findChamber(museId);
  if (existing) {
    const chamber = decodeMuseumChamber(existing.notes);
    if (chamber) return { record: existing, chamber };
  }

  const chamber = createMuseumChamber(museId);
  const record = await prisma.project.create({
    data: {
      title: chamberTitle(museId),
      type: ProjectType.INTERNAL,
      status: ProjectStatus.ACTIVE,
      progress: 0,
      nextAction: "Continue chamber conversation",
      notes: encodeMuseumChamber(chamber),
    },
    select: { id: true, notes: true, createdAt: true, updatedAt: true },
  });
  return { record, chamber };
}

async function sharedProjects(): Promise<ChamberProjectContext[]> {
  const records = await prisma.project.findMany({
    where: { archivedAt: null },
    select: { id: true, title: true, type: true, status: true, progress: true, nextAction: true, notes: true },
    orderBy: { updatedAt: "desc" },
    take: 40,
  });

  return records
    .filter((project) => !project.notes?.startsWith(MUSEUM_QUEST_PREFIX) && !project.notes?.startsWith(MUSEUM_CHAMBER_PREFIX))
    .filter((project) => ![ProjectStatus.COMPLETE, ProjectStatus.ARCHIVED].includes(project.status))
    .slice(0, 12)
    .map(({ id, title, type, status, progress, nextAction }) => ({ id, title, type, status, progress, nextAction }));
}

function actionLabel(type: string) {
  return type.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

async function museQuests(museId: MuseId): Promise<ChamberQuestContext[]> {
  const records = await prisma.project.findMany({
    where: {
      type: ProjectType.INTERNAL,
      archivedAt: null,
      notes: { startsWith: MUSEUM_QUEST_PREFIX },
    },
    select: { id: true, notes: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });

  return records.flatMap((record) => {
    const quest = decodeMuseumQuest(record.notes);
    const assignment = quest?.assignments.find((item) => item.museId === museId);
    if (!quest || !assignment) return [];

    const pendingApprovals = quest.events.reduce(
      (count, event) => count + event.responses.filter((response) => response.approvalStatus === "PENDING").length,
      0,
    );
    const recentActivity = quest.events.slice(-3).map((event) => {
      const target = event.targetMuseId ? ` → ${MUSE_BY_ID[event.targetMuseId]?.name ?? event.targetMuseId}` : "";
      return `${actionLabel(event.type)} by ${MUSE_BY_ID[event.actorMuseId]?.name ?? event.actorMuseId}${target}`;
    });

    return [{
      id: record.id,
      title: quest.title,
      status: quest.status,
      role: assignment.role,
      brief: quest.brief,
      recentActivity,
      pendingApprovals,
    }];
  }).slice(0, 8);
}

function serialize(record: ChamberRecord, chamber: StoredMuseumChamber) {
  return {
    id: record.id,
    museId: chamber.museId,
    messages: chamber.messages,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export async function GET(_request: NextRequest, context: { params: Promise<{ museId: string }> }) {
  const { museId } = await context.params;
  if (!isMuseId(museId)) return NextResponse.json({ error: "Unknown Muse." }, { status: 404 });
  const { record, chamber } = await getOrCreateChamber(museId);
  return NextResponse.json(serialize(record, chamber));
}

export async function POST(request: NextRequest, context: { params: Promise<{ museId: string }> }) {
  const { museId } = await context.params;
  if (!isMuseId(museId)) return NextResponse.json({ error: "Unknown Muse." }, { status: 404 });

  const body = await request.json();
  const content = typeof body.message === "string" ? body.message.trim() : "";
  if (!content) return NextResponse.json({ error: "Write a message first." }, { status: 400 });
  if (content.length > 4000) return NextResponse.json({ error: "Chamber messages must be 4,000 characters or fewer." }, { status: 400 });

  const focusedProjectId = typeof body.contextProjectId === "string" && body.contextProjectId.trim() ? body.contextProjectId.trim() : null;
  const [state, projects, quests] = await Promise.all([
    getOrCreateChamber(museId),
    sharedProjects(),
    museQuests(museId),
  ]);

  const validFocusedProjectId = focusedProjectId && projects.some((project) => project.id === focusedProjectId) ? focusedProjectId : null;
  const withUser = appendUserMessage(state.chamber, content, validFocusedProjectId).chamber;
  const reply = await generateChamberReply({
    museId,
    messages: withUser.messages,
    projects,
    quests,
    focusedProjectId: validFocusedProjectId,
  });
  const completed = appendMuseMessage(withUser, {
    content: reply.content,
    model: reply.model,
    error: reply.error,
    contextProjectId: validFocusedProjectId,
  });

  const record = await prisma.project.update({
    where: { id: state.record.id },
    data: {
      notes: encodeMuseumChamber(completed),
      nextAction: reply.error ? "Resolve Chamber AI connection" : "Continue chamber conversation",
    },
    select: { id: true, notes: true, createdAt: true, updatedAt: true },
  });

  return NextResponse.json({ ...serialize(record, completed), generationError: reply.error || null });
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ museId: string }> }) {
  const { museId } = await context.params;
  if (!isMuseId(museId)) return NextResponse.json({ error: "Unknown Muse." }, { status: 404 });
  const state = await getOrCreateChamber(museId);
  const cleared = createMuseumChamber(museId);
  const record = await prisma.project.update({
    where: { id: state.record.id },
    data: { notes: encodeMuseumChamber(cleared), nextAction: "Continue chamber conversation" },
    select: { id: true, notes: true, createdAt: true, updatedAt: true },
  });
  return NextResponse.json(serialize(record, cleared));
}
