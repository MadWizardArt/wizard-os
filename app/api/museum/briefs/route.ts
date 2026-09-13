import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { isMuseId, type MuseId } from "../../../../lib/museum";
import {
  decodeMuseumBrief,
  encodeMuseumBrief,
  isBriefStatus,
  makeBriefHistory,
  MUSEUM_BRIEF_PREFIX,
  parseSupportMuseIds,
  progressForBrief,
  projectStatusForBrief,
  type BriefStatus,
  type StoredMuseumBrief,
} from "../../../../lib/museum-brief-storage";
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

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function serializeBrief(
  record: { id: string; createdAt: Date; updatedAt: Date },
  brief: StoredMuseumBrief,
  project: ProjectRecord | null,
) {
  return {
    id: record.id,
    ...brief,
    project,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

async function findLinkedProject(linkedProjectId: string | null): Promise<ProjectRecord | null> {
  if (!linkedProjectId) return null;
  return prisma.project.findFirst({
    where: { id: linkedProjectId, archivedAt: null },
    select: { id: true, title: true, type: true, status: true, progress: true, nextAction: true },
  });
}

function normalizeReceiptStatus(value: string): BriefStatus | null {
  const normalized = value.trim().toLowerCase().replaceAll("-", " ").replaceAll("_", " ");
  const map: Record<string, BriefStatus> = {
    queued: "QUEUED",
    "in progress": "IN_PROGRESS",
    active: "IN_PROGRESS",
    "ready for review": "READY_FOR_REVIEW",
    review: "READY_FOR_REVIEW",
    blocked: "BLOCKED",
    complete: "COMPLETE",
    completed: "COMPLETE",
    deferred: "DEFERRED",
  };
  return map[normalized] ?? null;
}

const MUSE_NAME_TO_ID: Record<string, MuseId> = {
  callista: "callista",
  callie: "callista",
  aurelia: "aurelia",
  lyra: "lyra",
  cleo: "cleo",
  novy: "novy",
  seraphine: "seraphine",
  tessa: "tessa",
  thalia: "thalia",
  melina: "melina",
};

function parseReceipt(text: string) {
  const fields = new Map<string, string>();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim().replace(/^[-*]\s*/, "");
    const separator = line.indexOf(":");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (value) fields.set(key, value);
  }
  const title = fields.get("brief") || fields.get("task") || "";
  const ownerRaw = (fields.get("owner") || fields.get("from / intended owner") || "").toLowerCase();
  const ownerToken = ownerRaw.split(/[\/,(]/)[0]?.trim() ?? "";
  const leadMuseId = MUSE_NAME_TO_ID[ownerToken] ?? null;
  return {
    title,
    leadMuseId,
    status: fields.get("status") ? normalizeReceiptStatus(fields.get("status")!) : null,
    objective: fields.get("objective") || "",
    decision: fields.get("decision") || fields.get("decision or constraint") || "",
    completed: fields.get("completed") || fields.get("completed and evidence") || "",
    evidence: fields.get("evidence") || "",
    artifact: fields.get("artifact") || "",
    blocker: fields.get("blocker") || fields.get("remaining issue") || "",
    nextAction: fields.get("next action") || "",
    dueDate: fields.get("due") || fields.get("due date") || "",
  };
}

export async function GET() {
  const records = await prisma.project.findMany({
    where: {
      type: ProjectType.INTERNAL,
      archivedAt: null,
      notes: { startsWith: MUSEUM_BRIEF_PREFIX },
    },
    select: { id: true, notes: true, createdAt: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });

  const parsed = records.flatMap((record) => {
    const brief = decodeMuseumBrief(record.notes);
    return brief ? [{ record, brief }] : [];
  });
  const linkedIds = [...new Set(parsed.map((item) => item.brief.linkedProjectId).filter((id): id is string => Boolean(id)))];
  const linkedProjects = linkedIds.length
    ? await prisma.project.findMany({
        where: { id: { in: linkedIds }, archivedAt: null },
        select: { id: true, title: true, type: true, status: true, progress: true, nextAction: true },
      })
    : [];
  const projectById = new Map(linkedProjects.map((project) => [project.id, project]));

  return NextResponse.json(
    parsed.map(({ record, brief }) => serializeBrief(record, brief, brief.linkedProjectId ? projectById.get(brief.linkedProjectId) ?? null : null)),
  );
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  if (typeof body.receiptText === "string") {
    const receipt = parseReceipt(body.receiptText);
    if (!receipt.title) return NextResponse.json({ error: "Receipt must include a Brief: or Task: line." }, { status: 400 });
    if (!receipt.leadMuseId) return NextResponse.json({ error: "Receipt must name a recognized Muse as Owner." }, { status: 400 });

    const records = await prisma.project.findMany({
      where: { type: ProjectType.INTERNAL, archivedAt: null, notes: { startsWith: MUSEUM_BRIEF_PREFIX } },
      select: { id: true, notes: true, createdAt: true, updatedAt: true },
    });
    const existing = records.find((record) => decodeMuseumBrief(record.notes)?.title.toLowerCase() === receipt.title.toLowerCase());

    if (existing) {
      const current = decodeMuseumBrief(existing.notes)!;
      const evidenceParts = [current.evidence, receipt.completed, receipt.evidence].filter(Boolean);
      const next: StoredMuseumBrief = {
        ...current,
        leadMuseId: receipt.leadMuseId,
        status: receipt.status ?? current.status,
        objective: receipt.objective || current.objective,
        decision: receipt.decision || current.decision,
        evidence: evidenceParts.join("\n").slice(0, 2500),
        artifact: receipt.artifact || current.artifact,
        blocker: receipt.blocker || current.blocker,
        nextAction: receipt.nextAction || current.nextAction,
        dueDate: receipt.dueDate || current.dueDate,
        history: [...current.history, makeBriefHistory("NOTE", "Museum Receipt imported."), ...(receipt.decision ? [makeBriefHistory("DECISION", receipt.decision)] : [])].slice(-24),
      };
      const record = await prisma.project.update({
        where: { id: existing.id },
        data: {
          title: `Museum Brief · ${next.title}`,
          status: projectStatusForBrief(next.status),
          progress: progressForBrief(next.status),
          nextAction: next.nextAction || "Review in The Museum",
          notes: encodeMuseumBrief(next),
        },
        select: { id: true, createdAt: true, updatedAt: true },
      });
      return NextResponse.json(serializeBrief(record, next, await findLinkedProject(next.linkedProjectId)));
    }

    const created: StoredMuseumBrief = {
      version: 1,
      title: receipt.title.slice(0, 120),
      objective: receipt.objective.slice(0, 2500),
      status: receipt.status ?? "IN_PROGRESS",
      leadMuseId: receipt.leadMuseId,
      supportMuseIds: [],
      linkedProjectId: null,
      evidence: [receipt.completed, receipt.evidence].filter(Boolean).join("\n").slice(0, 2500),
      artifact: receipt.artifact.slice(0, 1200),
      blocker: receipt.blocker.slice(0, 1200),
      decision: receipt.decision.slice(0, 1200),
      nextAction: receipt.nextAction.slice(0, 1200),
      dueDate: receipt.dueDate.slice(0, 40),
      history: [makeBriefHistory("CREATED", "Brief created from Museum Receipt."), ...(receipt.decision ? [makeBriefHistory("DECISION", receipt.decision)] : [])],
    };
    const record = await prisma.project.create({
      data: {
        title: `Museum Brief · ${created.title}`,
        type: ProjectType.INTERNAL,
        status: projectStatusForBrief(created.status),
        progress: progressForBrief(created.status),
        nextAction: created.nextAction || "Review in The Museum",
        notes: encodeMuseumBrief(created),
      },
      select: { id: true, createdAt: true, updatedAt: true },
    });
    return NextResponse.json(serializeBrief(record, created, null), { status: 201 });
  }

  const title = clean(body.title, 120);
  const objective = clean(body.objective, 2500);
  if (!title) return NextResponse.json({ error: "Brief title is required." }, { status: 400 });
  if (!isMuseId(body.leadMuseId)) return NextResponse.json({ error: "Choose a Lead Muse." }, { status: 400 });
  const supportMuseIds = parseSupportMuseIds(body.supportMuseIds, body.leadMuseId);
  if (!supportMuseIds) return NextResponse.json({ error: "Choose up to four unique support Muses." }, { status: 400 });
  const status = isBriefStatus(body.status) ? body.status : "QUEUED";
  const linkedProjectId = clean(body.linkedProjectId, 120) || null;
  if (linkedProjectId && !(await findLinkedProject(linkedProjectId))) {
    return NextResponse.json({ error: "The linked Wizard OS project could not be found." }, { status: 400 });
  }

  const brief: StoredMuseumBrief = {
    version: 1,
    title,
    objective,
    status,
    leadMuseId: body.leadMuseId,
    supportMuseIds,
    linkedProjectId,
    evidence: clean(body.evidence, 2500),
    artifact: clean(body.artifact, 1200),
    blocker: clean(body.blocker, 1200),
    decision: clean(body.decision, 1200),
    nextAction: clean(body.nextAction, 1200),
    dueDate: clean(body.dueDate, 40),
    history: [makeBriefHistory("CREATED", `Brief opened with ${body.leadMuseId} as Lead.`)],
  };

  const record = await prisma.project.create({
    data: {
      title: `Museum Brief · ${title}`,
      type: ProjectType.INTERNAL,
      status: projectStatusForBrief(status),
      progress: progressForBrief(status),
      nextAction: brief.nextAction || "Review in The Museum",
      notes: encodeMuseumBrief(brief),
    },
    select: { id: true, createdAt: true, updatedAt: true },
  });

  return NextResponse.json(serializeBrief(record, brief, await findLinkedProject(linkedProjectId)), { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const id = clean(body.id, 120);
  if (!id) return NextResponse.json({ error: "Brief id is required." }, { status: 400 });

  const existing = await prisma.project.findFirst({
    where: { id, type: ProjectType.INTERNAL, archivedAt: null, notes: { startsWith: MUSEUM_BRIEF_PREFIX } },
    select: { id: true, notes: true, createdAt: true, updatedAt: true },
  });
  if (!existing) return NextResponse.json({ error: "Brief not found." }, { status: 404 });
  const current = decodeMuseumBrief(existing.notes);
  if (!current) return NextResponse.json({ error: "Brief record is invalid." }, { status: 409 });

  const leadMuseId = body.leadMuseId === undefined ? current.leadMuseId : isMuseId(body.leadMuseId) ? body.leadMuseId : null;
  if (!leadMuseId) return NextResponse.json({ error: "Choose a valid Lead Muse." }, { status: 400 });
  const supportMuseIds = body.supportMuseIds === undefined
    ? current.supportMuseIds.filter((id) => id !== leadMuseId)
    : parseSupportMuseIds(body.supportMuseIds, leadMuseId);
  if (!supportMuseIds) return NextResponse.json({ error: "Choose up to four unique support Muses." }, { status: 400 });
  const status = body.status === undefined ? current.status : isBriefStatus(body.status) ? body.status : null;
  if (!status) return NextResponse.json({ error: "Choose a valid Brief status." }, { status: 400 });

  const linkedProjectId = body.linkedProjectId === undefined ? current.linkedProjectId : clean(body.linkedProjectId, 120) || null;
  if (linkedProjectId && !(await findLinkedProject(linkedProjectId))) {
    return NextResponse.json({ error: "The linked Wizard OS project could not be found." }, { status: 400 });
  }

  const next: StoredMuseumBrief = {
    ...current,
    title: body.title === undefined ? current.title : clean(body.title, 120),
    objective: body.objective === undefined ? current.objective : clean(body.objective, 2500),
    status,
    leadMuseId,
    supportMuseIds,
    linkedProjectId,
    evidence: body.evidence === undefined ? current.evidence : clean(body.evidence, 2500),
    artifact: body.artifact === undefined ? current.artifact : clean(body.artifact, 1200),
    blocker: body.blocker === undefined ? current.blocker : clean(body.blocker, 1200),
    decision: body.decision === undefined ? current.decision : clean(body.decision, 1200),
    nextAction: body.nextAction === undefined ? current.nextAction : clean(body.nextAction, 1200),
    dueDate: body.dueDate === undefined ? current.dueDate : clean(body.dueDate, 40),
    history: [...current.history],
  };
  if (!next.title) return NextResponse.json({ error: "Brief title is required." }, { status: 400 });

  if (next.status !== current.status) next.history.push(makeBriefHistory("STATUS", `${current.status} → ${next.status}`));
  if (next.leadMuseId !== current.leadMuseId) next.history.push(makeBriefHistory("OWNER", `${current.leadMuseId} → ${next.leadMuseId}`));
  if (next.decision && next.decision !== current.decision) next.history.push(makeBriefHistory("DECISION", next.decision));
  if (next.artifact && next.artifact !== current.artifact) next.history.push(makeBriefHistory("ARTIFACT", next.artifact));
  if (next.nextAction !== current.nextAction) next.history.push(makeBriefHistory("NOTE", next.nextAction ? `Next action: ${next.nextAction}` : "Next action cleared."));
  next.history = next.history.slice(-24);

  const record = await prisma.project.update({
    where: { id },
    data: {
      title: `Museum Brief · ${next.title}`,
      status: projectStatusForBrief(next.status),
      progress: progressForBrief(next.status),
      nextAction: next.nextAction || "Review in The Museum",
      notes: encodeMuseumBrief(next),
    },
    select: { id: true, createdAt: true, updatedAt: true },
  });

  return NextResponse.json(serializeBrief(record, next, await findLinkedProject(next.linkedProjectId)));
}
