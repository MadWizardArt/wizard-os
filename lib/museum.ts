export const MUSE_IDS = [
  "callista",
  "aurelia",
  "lyra",
  "cleo",
  "novy",
  "seraphine",
  "tessa",
  "thalia",
  "melina",
] as const;

export type MuseId = (typeof MUSE_IDS)[number];

const MUSE_ID_SET = new Set<string>(MUSE_IDS);

export function isMuseId(value: unknown): value is MuseId {
  return typeof value === "string" && MUSE_ID_SET.has(value);
}
