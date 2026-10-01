export type MusePresenceState = "working" | "available" | "waiting" | "council" | "quiet";

export const PRESENCE_META: Record<MusePresenceState, { label: string; roomLine: string }> = {
  working: { label: "Working", roomLine: "Her attention is engaged." },
  available: { label: "Available", roomLine: "Her room is open." },
  waiting: { label: "Waiting on Brandon", roomLine: "She is awaiting your input." },
  council: { label: "In Council", roomLine: "Her attention is at the council table." },
  quiet: { label: "Quiet", roomLine: "The room has settled." },
};

export function deriveDefaultPresence(hasFocus: boolean): MusePresenceState {
  return hasFocus ? "working" : "available";
}
