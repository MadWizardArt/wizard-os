import { isMuseId, type MuseId } from "./museum";

export const MUSEUM_SIGNAL_PREFIX = "MUSEUM_SIGNAL_V1:";

export type MuseSignalType = "update" | "recommendation" | "waiting" | "completed" | "warning" | "urgent";
export type MuseSignalPriority = "normal" | "high" | "urgent";
export type MuseSignalPresence = "working" | "available" | "waiting" | "council" | "quiet";

export type StoredMuseSignal = {
  version: 1;
  museId: MuseId;
  title: string;
  summary: string;
  type: MuseSignalType;
  area: string;
  priority: MuseSignalPriority;
  visualState: MuseSignalPresence;
  relatedProjectId: string | null;
  sourceKey: string;
  occurredAt: string;
  readAt: string | null;
  acknowledgedAt: string | null;
};

const SIGNAL_TYPES = new Set<MuseSignalType>(["update", "recommendation", "waiting", "completed", "warning", "urgent"]);
const PRIORITIES = new Set<MuseSignalPriority>(["normal", "high", "urgent"]);
const PRESENCE_STATES = new Set<MuseSignalPresence>(["working", "available", "waiting", "council", "quiet"]);

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function nullableText(value: unknown, max: number) {
  const cleaned = text(value, max);
  return cleaned || null;
}

function iso(value: unknown) {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function encodeMuseSignal(signal: StoredMuseSignal) {
  return `${MUSEUM_SIGNAL_PREFIX}${JSON.stringify(signal)}`;
}

export function decodeMuseSignal(notes: string | null): StoredMuseSignal | null {
  if (!notes?.startsWith(MUSEUM_SIGNAL_PREFIX)) return null;
  try {
    const parsed = JSON.parse(notes.slice(MUSEUM_SIGNAL_PREFIX.length)) as Record<string, unknown>;
    if (Number(parsed.version) !== 1 || !isMuseId(parsed.museId)) return null;
    if (!SIGNAL_TYPES.has(parsed.type as MuseSignalType)) return null;
    if (!PRIORITIES.has(parsed.priority as MuseSignalPriority)) return null;
    if (!PRESENCE_STATES.has(parsed.visualState as MuseSignalPresence)) return null;

    const title = text(parsed.title, 140);
    const summary = text(parsed.summary, 600);
    const area = text(parsed.area, 120);
    const sourceKey = text(parsed.sourceKey, 220);
    const occurredAt = iso(parsed.occurredAt);
    if (!title || !summary || !area || !sourceKey || !occurredAt) return null;

    return {
      version: 1,
      museId: parsed.museId,
      title,
      summary,
      type: parsed.type as MuseSignalType,
      area,
      priority: parsed.priority as MuseSignalPriority,
      visualState: parsed.visualState as MuseSignalPresence,
      relatedProjectId: nullableText(parsed.relatedProjectId, 120),
      sourceKey,
      occurredAt,
      readAt: iso(parsed.readAt),
      acknowledgedAt: iso(parsed.acknowledgedAt),
    };
  } catch {
    return null;
  }
}
