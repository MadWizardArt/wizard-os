import { randomUUID } from "node:crypto";
import { isMuseId, type MuseId } from "./museum";

export const MUSEUM_CHAMBER_PREFIX = "MUSEUM_CHAMBER_V1:";

export type ChamberRole = "USER" | "MUSE";

export type ChamberMessage = {
  id: string;
  role: ChamberRole;
  museId: MuseId;
  content: string;
  createdAt: string;
  model: string;
  error: string;
  contextProjectId: string | null;
};

export type StoredMuseumChamber = {
  version: 1;
  museId: MuseId;
  messages: ChamberMessage[];
};

function parseMessage(value: unknown, chamberMuseId: MuseId): ChamberMessage | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || !record.id) return null;
  if (record.role !== "USER" && record.role !== "MUSE") return null;
  const museId = isMuseId(record.museId) ? record.museId : chamberMuseId;
  return {
    id: record.id,
    role: record.role,
    museId,
    content: typeof record.content === "string" ? record.content.slice(0, 6000) : "",
    createdAt: typeof record.createdAt === "string" && record.createdAt ? record.createdAt : new Date(0).toISOString(),
    model: typeof record.model === "string" ? record.model.slice(0, 120) : "",
    error: typeof record.error === "string" ? record.error.slice(0, 500) : "",
    contextProjectId: typeof record.contextProjectId === "string" && record.contextProjectId ? record.contextProjectId : null,
  };
}

export function decodeMuseumChamber(notes: string | null): StoredMuseumChamber | null {
  if (!notes?.startsWith(MUSEUM_CHAMBER_PREFIX)) return null;
  try {
    const parsed = JSON.parse(notes.slice(MUSEUM_CHAMBER_PREFIX.length)) as Record<string, unknown>;
    if (parsed.version !== 1 || !isMuseId(parsed.museId)) return null;
    const messages = Array.isArray(parsed.messages)
      ? parsed.messages.flatMap((item) => {
          const message = parseMessage(item, parsed.museId as MuseId);
          return message ? [message] : [];
        }).slice(-80)
      : [];
    return { version: 1, museId: parsed.museId, messages };
  } catch {
    return null;
  }
}

export function encodeMuseumChamber(chamber: StoredMuseumChamber) {
  return `${MUSEUM_CHAMBER_PREFIX}${JSON.stringify({ ...chamber, version: 1, messages: chamber.messages.slice(-80) })}`;
}

export function createMuseumChamber(museId: MuseId): StoredMuseumChamber {
  return { version: 1, museId, messages: [] };
}

export function appendUserMessage(
  chamber: StoredMuseumChamber,
  content: string,
  contextProjectId: string | null,
): { chamber: StoredMuseumChamber; message: ChamberMessage } {
  const message: ChamberMessage = {
    id: randomUUID(),
    role: "USER",
    museId: chamber.museId,
    content: content.trim().slice(0, 4000),
    createdAt: new Date().toISOString(),
    model: "",
    error: "",
    contextProjectId,
  };
  return { chamber: { ...chamber, messages: [...chamber.messages, message].slice(-80) }, message };
}

export function appendMuseMessage(
  chamber: StoredMuseumChamber,
  input: { content: string; model: string; error?: string; contextProjectId?: string | null },
): StoredMuseumChamber {
  const message: ChamberMessage = {
    id: randomUUID(),
    role: "MUSE",
    museId: chamber.museId,
    content: input.content.slice(0, 6000),
    createdAt: new Date().toISOString(),
    model: input.model.slice(0, 120),
    error: (input.error ?? "").slice(0, 500),
    contextProjectId: input.contextProjectId ?? null,
  };
  return { ...chamber, messages: [...chamber.messages, message].slice(-80) };
}
