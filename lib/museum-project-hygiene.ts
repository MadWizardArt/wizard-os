export const MUSEUM_INTERNAL_PROJECT_PREFIXES = [
  "MUSEUM_BRIEF_V1:",
  "MUSEUM_CHAMBER_V1:",
  "MUSEUM_FOCUS_V1:",
  "MUSEUM_QUEST_V1:",
  "MUSEUM_SIGNAL_V1:",
  "MUSEUM_MEMORY_V1:",
  "MUSEUM_KNOWLEDGE_V1:",
] as const;

export function isMuseumInfrastructureNotes(notes: string | null | undefined) {
  return typeof notes === "string"
    && MUSEUM_INTERNAL_PROJECT_PREFIXES.some((prefix) => notes.startsWith(prefix));
}
