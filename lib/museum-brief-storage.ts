import { randomUUID } from "node:crypto";
import { ProjectStatus } from "../app/generated/prisma/client";
import { isMuseId, type MuseId } from "./museum";

export const MUSEUM_BRIEF_PREFIX = "MUSEUM_BRIEF_V1:";

export type BriefStatus = "QUEUED" | "IN_PROGRESS" | "READY_FOR_REVIEW" | "BLOCKED" | "COMPLETE" | "DEFERRED";
export type BriefHistoryKind = "CREATED" | "STATUS" | "OWNER" | "DECISION" | "ARTIFACT" | "NOTE";

export type BriefHistoryEntry = {
  id: string;
  kind: BriefHistoryKind;
  text: string;
  createdAt: string;
};

export type StoredMuseumBrief = {
  version: 1;
  title: string;
  objective: string;
  status: BriefStatus;
  leadMuseId: MuseId;
  supportMuseIds: MuseId[];
  linkedProjectId: string | null;
  evidence: string;
  artifact: string;
  blocker: string;
  decision: string;
  nextAction: string;
  dueDate: string;
  history: BriefHistoryEntry[];
};

const BRIEF_STATUSES = new Set<BriefStatus>([
  "QUEUED",
  "IN_PROGRESS",
  "READY_FOR_REVIEW",
  "BLOCKED",
  "COMPLETE",
  "DEFERRED",
]);

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function isBriefStatus(value: unknown): value is BriefStatus {
  return typeof value === "string" && BRIEF_STATUSES.has(value as BriefStatus);
}

export function parseSupportMuseIds(value: unknown, leadMuseId: MuseId): MuseId[] | null {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 4) return null;
  const unique: MuseId[] = [];
  for (const item of value) {
    if (!isMuseId(item) || item === leadMuseId) return null;
    if (!unique.includes(item)) unique.push(item);
  }
  return unique;
}

function parseHistory(value: unknown): BriefHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const kind = clean(record.kind, 40) as BriefHistoryKind;
    if (!["CREATED", "STATUS", "OWNER", "DECISION", "ARTIFACT", "NOTE"].includes(kind)) return [];
    const text = clean(record.text, 700);
    if (!text) return [];
    return [{
      id: clean(record.id, 100) || randomUUID(),
      kind,
      text,
      createdAt: clean(record.createdAt, 80) || new Date(0).toISOString(),
    }];
  }).slice(-24);
}

export function makeBriefHistory(kind: BriefHistoryKind, text: string): BriefHistoryEntry {
  return {
    id: randomUUID(),
    kind,
    text: text.trim().slice(0, 700),
    createdAt: new Date().toISOString(),
  };
}

export function encodeMuseumBrief(brief: StoredMuseumBrief) {
  return `${MUSEUM_BRIEF_PREFIX}${JSON.stringify({ ...brief, version: 1, history: brief.history.slice(-24) })}`;
}

export function decodeMuseumBrief(notes: string | null): StoredMuseumBrief | null {
  if (!notes?.startsWith(MUSEUM_BRIEF_PREFIX)) return null;
  try {
    const parsed = JSON.parse(notes.slice(MUSEUM_BRIEF_PREFIX.length)) as Record<string, unknown>;
    if (Number(parsed.version) !== 1) return null;
    const title = clean(parsed.title, 120);
    const objective = clean(parsed.objective, 2500);
    if (!title || !isMuseId(parsed.leadMuseId)) return null;
    const supportMuseIds = parseSupportMuseIds(parsed.supportMuseIds, parsed.leadMuseId);
    if (!supportMuseIds) return null;
    return {
      version: 1,
      title,
      objective,
      status: isBriefStatus(parsed.status) ? parsed.status : "QUEUED",
      leadMuseId: parsed.leadMuseId,
      supportMuseIds,
      linkedProjectId: clean(parsed.linkedProjectId, 120) || null,
      evidence: clean(parsed.evidence, 2500),
      artifact: clean(parsed.artifact, 1200),
      blocker: clean(parsed.blocker, 1200),
      decision: clean(parsed.decision, 1200),
      nextAction: clean(parsed.nextAction, 1200),
      dueDate: clean(parsed.dueDate, 40),
      history: parseHistory(parsed.history),
    };
  } catch {
    return null;
  }
}

export function projectStatusForBrief(status: BriefStatus): ProjectStatus {
  switch (status) {
    case "QUEUED": return ProjectStatus.PLANNED;
    case "BLOCKED": return ProjectStatus.BLOCKED;
    case "READY_FOR_REVIEW": return ProjectStatus.WAITING;
    case "COMPLETE": return ProjectStatus.COMPLETE;
    case "DEFERRED": return ProjectStatus.WAITING;
    case "IN_PROGRESS":
    default:
      return ProjectStatus.ACTIVE;
  }
}

export function progressForBrief(status: BriefStatus) {
  switch (status) {
    case "QUEUED": return 0;
    case "IN_PROGRESS": return 45;
    case "BLOCKED": return 45;
    case "READY_FOR_REVIEW": return 90;
    case "COMPLETE": return 100;
    case "DEFERRED": return 0;
  }
}
