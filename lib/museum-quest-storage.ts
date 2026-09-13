import { randomUUID } from "node:crypto";
import { ProjectStatus } from "../app/generated/prisma/client";
import { isMuseId, type MuseId } from "./museum";

export const MUSEUM_QUEST_PREFIX = "MUSEUM_QUEST_V1:";

export type QuestStatus = "DRAFT" | "ACTIVE" | "WAITING" | "REVIEW" | "COMPLETE" | "ARCHIVED";
export type AssignmentRole = "LEAD" | "SUPPORT" | "REVIEWER";
export type MuseActionType = "CONSULT" | "DELEGATE" | "HANDOFF" | "REVIEW" | "CHALLENGE" | "ESCALATE" | "CONVENE";

export type QuestAssignment = {
  museId: MuseId;
  role: AssignmentRole;
  note: string;
};

export type MuseActionEvent = {
  id: string;
  type: MuseActionType;
  actorMuseId: MuseId;
  targetMuseId: MuseId | null;
  message: string;
  createdAt: string;
};

export type StoredMuseumQuest = {
  version: 2;
  title: string;
  brief: string;
  status: QuestStatus;
  linkedProjectId: string | null;
  assignments: QuestAssignment[];
  events: MuseActionEvent[];
};

const QUEST_STATUSES = new Set<QuestStatus>(["DRAFT", "ACTIVE", "WAITING", "REVIEW", "COMPLETE", "ARCHIVED"]);
const ASSIGNMENT_ROLES = new Set<AssignmentRole>(["LEAD", "SUPPORT", "REVIEWER"]);
const ACTION_TYPES = new Set<MuseActionType>(["CONSULT", "DELEGATE", "HANDOFF", "REVIEW", "CHALLENGE", "ESCALATE", "CONVENE"]);
const TARGET_REQUIRED = new Set<MuseActionType>(["CONSULT", "DELEGATE", "HANDOFF", "REVIEW", "CHALLENGE"]);

export function parseQuestAssignments(value: unknown): QuestAssignment[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 3) return null;
  const seen = new Set<string>();
  const assignments: QuestAssignment[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const record = item as Record<string, unknown>;
    if (!isMuseId(record.museId) || seen.has(record.museId)) return null;
    if (typeof record.role !== "string" || !ASSIGNMENT_ROLES.has(record.role as AssignmentRole)) return null;
    seen.add(record.museId);
    assignments.push({
      museId: record.museId,
      role: record.role as AssignmentRole,
      note: typeof record.note === "string" ? record.note.trim().slice(0, 500) : "",
    });
  }

  return assignments.filter((assignment) => assignment.role === "LEAD").length === 1 ? assignments : null;
}

function parseActionEvents(value: unknown): MuseActionEvent[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    if (typeof record.id !== "string" || !record.id) return [];
    if (typeof record.type !== "string" || !ACTION_TYPES.has(record.type as MuseActionType)) return [];
    if (!isMuseId(record.actorMuseId)) return [];
    const targetMuseId = record.targetMuseId === null ? null : isMuseId(record.targetMuseId) ? record.targetMuseId : null;
    if (TARGET_REQUIRED.has(record.type as MuseActionType) && !targetMuseId) return [];
    return [{
      id: record.id,
      type: record.type as MuseActionType,
      actorMuseId: record.actorMuseId,
      targetMuseId,
      message: typeof record.message === "string" ? record.message.slice(0, 1200) : "",
      createdAt: typeof record.createdAt === "string" && record.createdAt ? record.createdAt : new Date(0).toISOString(),
    }];
  }).slice(-100);
}

export function encodeMuseumQuest(quest: StoredMuseumQuest) {
  return `${MUSEUM_QUEST_PREFIX}${JSON.stringify({ ...quest, version: 2, events: quest.events.slice(-100) })}`;
}

export function decodeMuseumQuest(notes: string | null): StoredMuseumQuest | null {
  if (!notes?.startsWith(MUSEUM_QUEST_PREFIX)) return null;
  try {
    const parsed = JSON.parse(notes.slice(MUSEUM_QUEST_PREFIX.length)) as Record<string, unknown>;
    const assignments = parseQuestAssignments(parsed.assignments);
    if ((parsed.version !== 1 && parsed.version !== 2) || typeof parsed.title !== "string" || !parsed.title.trim() || !assignments) return null;
    const status = typeof parsed.status === "string" && QUEST_STATUSES.has(parsed.status as QuestStatus) ? parsed.status as QuestStatus : "ACTIVE";
    return {
      version: 2,
      title: parsed.title.trim().slice(0, 120),
      brief: typeof parsed.brief === "string" ? parsed.brief.slice(0, 2500) : "",
      status,
      linkedProjectId: typeof parsed.linkedProjectId === "string" && parsed.linkedProjectId ? parsed.linkedProjectId : null,
      assignments,
      events: parseActionEvents(parsed.events),
    };
  } catch {
    return null;
  }
}

export function projectStatusForQuest(status: QuestStatus): ProjectStatus {
  switch (status) {
    case "DRAFT": return ProjectStatus.PLANNED;
    case "WAITING": return ProjectStatus.WAITING;
    case "COMPLETE": return ProjectStatus.COMPLETE;
    case "ARCHIVED": return ProjectStatus.ARCHIVED;
    case "REVIEW":
    case "ACTIVE":
    default:
      return ProjectStatus.ACTIVE;
  }
}

export function isQuestStatus(value: unknown): value is QuestStatus {
  return typeof value === "string" && QUEST_STATUSES.has(value as QuestStatus);
}

export function isMuseActionType(value: unknown): value is MuseActionType {
  return typeof value === "string" && ACTION_TYPES.has(value as MuseActionType);
}

export function applyMuseAction(
  quest: StoredMuseumQuest,
  input: { type: MuseActionType; actorMuseId: MuseId; targetMuseId: MuseId | null; message: string },
): { quest: StoredMuseumQuest; event: MuseActionEvent } | { error: string } {
  const actor = quest.assignments.find((assignment) => assignment.museId === input.actorMuseId);
  if (!actor) return { error: "The acting Muse must already be assigned to this quest." };
  if (TARGET_REQUIRED.has(input.type) && !input.targetMuseId) return { error: "Choose a target Muse for this action." };
  if (input.targetMuseId === input.actorMuseId) return { error: "Choose another Muse as the target." };
  if ((input.type === "DELEGATE" || input.type === "HANDOFF") && actor.role !== "LEAD") {
    return { error: "Only the Lead Muse can delegate or hand off quest ownership." };
  }

  let assignments = quest.assignments.map((assignment) => ({ ...assignment }));
  let status = quest.status;

  if (input.type === "DELEGATE" && input.targetMuseId && !assignments.some((assignment) => assignment.museId === input.targetMuseId)) {
    if (assignments.length >= 3) return { error: "This quest already has three assigned Muses. Reassign a seat before delegating." };
    assignments.push({ museId: input.targetMuseId, role: "SUPPORT", note: input.message.slice(0, 500) });
  }

  if (input.type === "HANDOFF" && input.targetMuseId) {
    assignments = assignments.filter((assignment) => assignment.museId !== input.targetMuseId);
    assignments = assignments.map((assignment) => assignment.role === "LEAD" ? { ...assignment, role: "SUPPORT" as const } : assignment);
    const previousLeadIndex = assignments.findIndex((assignment) => assignment.museId === input.actorMuseId);
    if (previousLeadIndex >= 0 && assignments.length >= 3 && !quest.assignments.some((assignment) => assignment.museId === input.targetMuseId)) {
      assignments.splice(previousLeadIndex, 1);
    }
    assignments.unshift({ museId: input.targetMuseId, role: "LEAD", note: input.message.slice(0, 500) });
    assignments = assignments.slice(0, 3);
  }

  if (input.type === "REVIEW") status = "REVIEW";
  if (input.type === "ESCALATE") status = "WAITING";
  if (input.type === "DELEGATE" && status === "DRAFT") status = "ACTIVE";

  const event: MuseActionEvent = {
    id: randomUUID(),
    type: input.type,
    actorMuseId: input.actorMuseId,
    targetMuseId: input.targetMuseId,
    message: input.message.slice(0, 1200),
    createdAt: new Date().toISOString(),
  };

  return {
    quest: {
      ...quest,
      version: 2,
      status,
      assignments,
      events: [...quest.events, event].slice(-100),
    },
    event,
  };
}
