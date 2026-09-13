import { ProjectStatus } from "../app/generated/prisma/client";
import { isMuseId, type MuseId } from "./museum";

export const MUSEUM_QUEST_PREFIX = "MUSEUM_QUEST_V1:";

export type QuestStatus = "DRAFT" | "ACTIVE" | "WAITING" | "REVIEW" | "COMPLETE" | "ARCHIVED";
export type AssignmentRole = "LEAD" | "SUPPORT" | "REVIEWER";

export type QuestAssignment = {
  museId: MuseId;
  role: AssignmentRole;
  note: string;
};

export type StoredMuseumQuest = {
  version: 1;
  title: string;
  brief: string;
  status: QuestStatus;
  linkedProjectId: string | null;
  assignments: QuestAssignment[];
};

const QUEST_STATUSES = new Set<QuestStatus>(["DRAFT", "ACTIVE", "WAITING", "REVIEW", "COMPLETE", "ARCHIVED"]);
const ASSIGNMENT_ROLES = new Set<AssignmentRole>(["LEAD", "SUPPORT", "REVIEWER"]);

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

export function encodeMuseumQuest(quest: StoredMuseumQuest) {
  return `${MUSEUM_QUEST_PREFIX}${JSON.stringify(quest)}`;
}

export function decodeMuseumQuest(notes: string | null): StoredMuseumQuest | null {
  if (!notes?.startsWith(MUSEUM_QUEST_PREFIX)) return null;
  try {
    const parsed = JSON.parse(notes.slice(MUSEUM_QUEST_PREFIX.length)) as Partial<StoredMuseumQuest>;
    const assignments = parseQuestAssignments(parsed.assignments);
    if (parsed.version !== 1 || typeof parsed.title !== "string" || !parsed.title.trim() || !assignments) return null;
    const status = typeof parsed.status === "string" && QUEST_STATUSES.has(parsed.status as QuestStatus) ? parsed.status as QuestStatus : "ACTIVE";
    return {
      version: 1,
      title: parsed.title.trim().slice(0, 120),
      brief: typeof parsed.brief === "string" ? parsed.brief.slice(0, 2500) : "",
      status,
      linkedProjectId: typeof parsed.linkedProjectId === "string" && parsed.linkedProjectId ? parsed.linkedProjectId : null,
      assignments,
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
