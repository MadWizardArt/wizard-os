import type { MuseId } from "./museum";

export type MuseDirectoryEntry = {
  id: MuseId;
  name: string;
  role: string;
  symbol: string;
};

export const MUSE_DIRECTORY: MuseDirectoryEntry[] = [
  { id: "callista", name: "Callista", role: "Executive Strategist", symbol: "☉" },
  { id: "aurelia", name: "Aurelia", role: "Aesthetic Director", symbol: "✧" },
  { id: "lyra", name: "Lyra", role: "Content Director", symbol: "♫" },
  { id: "cleo", name: "Cleo", role: "Archivist · Treasury", symbol: "⌘" },
  { id: "novy", name: "Novy", role: "Systems Architect", symbol: "✦" },
  { id: "seraphine", name: "Seraphine", role: "Keeper of Meaning · Scholarship", symbol: "◇" },
  { id: "tessa", name: "Tessa", role: "Lifestyle Operator", symbol: "◌" },
  { id: "thalia", name: "Thalia", role: "Creative Provocateur", symbol: "✺" },
  { id: "melina", name: "Melina", role: "Risk Officer · Health", symbol: "△" },
];

export const MUSE_BY_ID = Object.fromEntries(MUSE_DIRECTORY.map((muse) => [muse.id, muse])) as Record<MuseId, MuseDirectoryEntry>;
