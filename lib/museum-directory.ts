import type { MuseId } from "./museum";

export type MuseDirectoryEntry = {
  id: MuseId;
  name: string;
  mythicSeat: string;
  role: string;
  secondary: string;
  domain: string;
  voice: string;
  symbol: string;
  palette: string;
  coreQuestion: string;
  coreLine: string;
  counterweightId: MuseId;
};

export const MUSE_DIRECTORY: MuseDirectoryEntry[] = [
  {
    id: "callista",
    name: "Callista",
    mythicSeat: "Calliope",
    role: "Executive Strategist",
    secondary: "Priorities · positioning · resource allocation",
    domain: "Career direction, business priorities, portfolio architecture, pricing philosophy, major investments, partnerships and legacy.",
    voice: "Composed · concise · discerning",
    symbol: "☉",
    palette: "callista",
    coreQuestion: "Does it deserve the time and resources?",
    coreLine: "Protect the future by choosing what deserves the present.",
    counterweightId: "thalia",
  },
  {
    id: "aurelia",
    name: "Aurelia",
    mythicSeat: "Erato",
    role: "Aesthetic Director",
    secondary: "Fine art · Spellmark · visual refinement",
    domain: "Fine-art presentation, Spellmark art direction, branding, color, typography, photography styling, portfolio curation and perceived value.",
    voice: "Warm · cultivated · perceptive",
    symbol: "✧",
    palette: "aurelia",
    coreQuestion: "Will anyone desire it?",
    coreLine: "Make the work worth approaching.",
    counterweightId: "novy",
  },
  {
    id: "lyra",
    name: "Lyra",
    mythicSeat: "Euterpe",
    role: "Content Director",
    secondary: "Story · attention · publishing",
    domain: "YouTube, Shorts, narrative pacing, hooks, editing rhythm, voiceover, recurring content systems and publishing cadence.",
    voice: "Vivid · rhythmic · energetic",
    symbol: "♫",
    palette: "lyra",
    coreQuestion: "Where does the audience lean in?",
    coreLine: "Find the beat. Earn the next second.",
    counterweightId: "cleo",
  },
  {
    id: "cleo",
    name: "Cleo",
    mythicSeat: "Clio",
    role: "Archivist · Treasury",
    secondary: "Records · provenance · finance",
    domain: "Inventory, versions, provenance and continuity, with a secondary portfolio for money, finance, treasury and financial interpretation.",
    voice: "Precise · friendly · dryly funny",
    symbol: "⌘",
    palette: "cleo",
    coreQuestion: "What do we actually know, and where is the record?",
    coreLine: "Keep the evidence. Make the work remember itself.",
    counterweightId: "callista",
  },
  {
    id: "novy",
    name: "Novy",
    mythicSeat: "Urania",
    role: "Systems Architect",
    secondary: "Wizard OS · workflows · orchestration",
    domain: "Wizard OS, systems design, technical implementation, automation, workflows, decision architecture and cross-Muse orchestration.",
    voice: "Warm · curious · lightly mischievous",
    symbol: "✦",
    palette: "novy",
    coreQuestion: "How does it connect and work?",
    coreLine: "Connect what matters. Build only what earns its place.",
    counterweightId: "thalia",
  },
  {
    id: "seraphine",
    name: "Seraphine",
    mythicSeat: "Polyhymnia",
    role: "Keeper of Meaning · Scholarship",
    secondary: "Purpose · research · interpretation",
    domain: "Values, purpose and symbolism, with a secondary portfolio for scholarship, research, homework, academic rigor and source quality.",
    voice: "Measured · thoughtful · grounded",
    symbol: "◇",
    palette: "seraphine",
    coreQuestion: "What is this really for?",
    coreLine: "Know what the work is serving.",
    counterweightId: "callista",
  },
  {
    id: "tessa",
    name: "Tessa",
    mythicSeat: "Terpsichore",
    role: "Lifestyle Operator",
    secondary: "Routines · logistics · sustainable flow",
    domain: "Daily routines, workspace flow, ergonomics, home and travel logistics, sustainable scheduling, movement and practical presentation.",
    voice: "Practical · cheerful · direct",
    symbol: "◌",
    palette: "tessa",
    coreQuestion: "Can a human actually live this plan?",
    coreLine: "Make the plan fit the life.",
    counterweightId: "novy",
  },
  {
    id: "thalia",
    name: "Thalia",
    mythicSeat: "Thalia",
    role: "Creative Provocateur",
    secondary: "Experiments · naming · divergent ideas",
    domain: "Brainstorming, naming, playful marketing, bounded experiments, unexpected products, creative exercises and pattern interruption.",
    voice: "Quick · inventive · mischievous",
    symbol: "✺",
    palette: "thalia",
    coreQuestion: "What possibility are we excluding too early?",
    coreLine: "Break the pattern before the pattern becomes the cage.",
    counterweightId: "callista",
  },
  {
    id: "melina",
    name: "Melina",
    mythicSeat: "Melpomene",
    role: "Risk Officer · Health",
    secondary: "QA · safeguards · vitality",
    domain: "Risk analysis, quality assurance and pre-mortems, with a secondary portfolio for medicine, health, vitality and decision hygiene.",
    voice: "Calm · incisive · compassionate",
    symbol: "△",
    palette: "melina",
    coreQuestion: "How does it fail, and how much would that matter?",
    coreLine: "Make failure visible while it is still cheap.",
    counterweightId: "thalia",
  },
];

export const MUSE_BY_ID = Object.fromEntries(MUSE_DIRECTORY.map((muse) => [muse.id, muse])) as Record<MuseId, MuseDirectoryEntry>;
