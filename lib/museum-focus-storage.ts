import { isMuseId, type MuseId } from "./museum";

export const MUSEUM_FOCUS_PREFIX = "MUSEUM_FOCUS_V1:";

export type MuseFocus = {
  museId: MuseId;
  title: string;
  nextAction: string;
  linkedProjectId: string | null;
};

export type StoredMuseumFocusBoard = {
  version: 1;
  focuses: MuseFocus[];
};

export function decodeMuseumFocusBoard(notes: string | null): StoredMuseumFocusBoard | null {
  if (!notes?.startsWith(MUSEUM_FOCUS_PREFIX)) return null;
  try {
    const parsed = JSON.parse(notes.slice(MUSEUM_FOCUS_PREFIX.length)) as Record<string, unknown>;
    if (Number(parsed.version) !== 1 || !Array.isArray(parsed.focuses)) return null;

    const seen = new Set<MuseId>();
    const focuses: MuseFocus[] = [];
    for (const item of parsed.focuses) {
      if (!item || typeof item !== "object") continue;
      const record = item as Record<string, unknown>;
      if (!isMuseId(record.museId) || seen.has(record.museId)) continue;
      const title = typeof record.title === "string" ? record.title.trim().slice(0, 140) : "";
      if (!title) continue;
      seen.add(record.museId);
      focuses.push({
        museId: record.museId,
        title,
        nextAction: typeof record.nextAction === "string" ? record.nextAction.trim().slice(0, 500) : "",
        linkedProjectId: typeof record.linkedProjectId === "string" && record.linkedProjectId.trim()
          ? record.linkedProjectId.trim().slice(0, 120)
          : null,
      });
    }

    return { version: 1, focuses };
  } catch {
    return null;
  }
}

export function encodeMuseumFocusBoard(board: StoredMuseumFocusBoard) {
  return `${MUSEUM_FOCUS_PREFIX}${JSON.stringify({ version: 1, focuses: board.focuses.slice(0, 9) })}`;
}
