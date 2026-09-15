import { Prisma, ProjectType } from "../app/generated/prisma/client";
import type { MuseId } from "./museum";
import { decodeMuseMemory, MUSEUM_MEMORY_PREFIX, type MuseOutcomeRating, type StoredMuseMemory } from "./museum-memory-storage";
import type { ProposalCategory } from "./museum-proposal-storage";

export type SharedMemorySignal = {
  id: string;
  sourceMuseId: MuseId;
  memory: StoredMuseMemory;
  relevance: string;
};

export type CouncilPattern = {
  category: ProposalCategory;
  kind: "convergence" | "caution" | "mixed";
  sampleSize: number;
  museCount: number;
  sourceMuseIds: MuseId[];
  positive: number;
  neutral: number;
  weak: number;
  summary: string;
};

export type SharedCouncilCognition = {
  targetMuseId: MuseId;
  routedMemories: SharedMemorySignal[];
  patterns: CouncilPattern[];
};

type CognitionDb = Pick<Prisma.TransactionClient, "project">;

type RouteRule = {
  recipients: MuseId[];
  reason: string;
};

const CATEGORY_ROUTES: Record<ProposalCategory, RouteRule> = {
  revenue: {
    recipients: ["callista", "cleo", "aurelia", "lyra", "tessa"],
    reason: "Revenue evidence can change prioritization, treasury judgment, offer design, promotion, or sustainable workload.",
  },
  product: {
    recipients: ["callista", "aurelia", "lyra", "cleo", "thalia"],
    reason: "Product evidence can change strategy, design direction, launch storytelling, economics, or experimentation.",
  },
  content: {
    recipients: ["callista", "lyra", "aurelia", "cleo", "thalia"],
    reason: "Content evidence can change campaign priority, storytelling, presentation, commercial attribution, or creative experiments.",
  },
  system: {
    recipients: ["novy", "melina", "callista", "tessa"],
    reason: "System evidence can change architecture, risk controls, strategic throughput, or day-to-day usability.",
  },
  risk: {
    recipients: ["melina", "novy", "callista", "seraphine"],
    reason: "Risk evidence can change safeguards, system design, strategic judgment, or claims and research standards.",
  },
  research: {
    recipients: ["seraphine", "novy", "callista", "thalia", "melina"],
    reason: "Research evidence can change scholarship, technical synthesis, strategy, experimentation, or verification standards.",
  },
  capacity: {
    recipients: ["tessa", "callista", "novy", "cleo", "melina"],
    reason: "Capacity evidence can change sustainable scheduling, priorities, workflow design, cost judgment, or overload risk.",
  },
  experiment: {
    recipients: ["thalia", "aurelia", "lyra", "callista", "seraphine", "melina"],
    reason: "Experiment evidence can change ideation, aesthetics, storytelling, strategic bets, meaning, or downside controls.",
  },
};

function outcomeWeight(rating: MuseOutcomeRating | null) {
  if (rating === "strong") return 5;
  if (rating === "weak") return 4;
  if (rating === "useful") return 3;
  if (rating === "neutral") return 1;
  return 0;
}

function makePattern(category: ProposalCategory, memories: StoredMuseMemory[]): CouncilPattern | null {
  const outcomes = memories.filter((memory) => memory.kind === "outcome" && Boolean(memory.outcomeRating));
  const sourceMuseIds = [...new Set(outcomes.map((memory) => memory.museId))];
  if (outcomes.length < 3 || sourceMuseIds.length < 2) return null;

  const positive = outcomes.filter((memory) => memory.outcomeRating === "strong" || memory.outcomeRating === "useful").length;
  const neutral = outcomes.filter((memory) => memory.outcomeRating === "neutral").length;
  const weak = outcomes.filter((memory) => memory.outcomeRating === "weak").length;
  const positiveRate = positive / outcomes.length;
  const weakRate = weak / outcomes.length;
  const kind: CouncilPattern["kind"] = weakRate >= 0.5 ? "caution" : positiveRate >= 2 / 3 ? "convergence" : "mixed";
  const summary = kind === "convergence"
    ? `${positive} of ${outcomes.length} verified ${category} outcomes were strong or useful across ${sourceMuseIds.length} Muses. Treat this as Council-level supporting evidence, not an automatic decision.`
    : kind === "caution"
      ? `${weak} of ${outcomes.length} verified ${category} outcomes were weak across ${sourceMuseIds.length} Muses. Treat this as a Council-level caution signal, not a prohibition.`
      : `${outcomes.length} verified ${category} outcomes across ${sourceMuseIds.length} Muses are mixed. The Council should preserve uncertainty rather than force a conclusion.`;

  return {
    category,
    kind,
    sampleSize: outcomes.length,
    museCount: sourceMuseIds.length,
    sourceMuseIds,
    positive,
    neutral,
    weak,
    summary,
  };
}

export async function readSharedCouncilCognition(db: CognitionDb, targetMuseId: MuseId): Promise<SharedCouncilCognition> {
  const records = await db.project.findMany({
    where: {
      type: ProjectType.INTERNAL,
      notes: { startsWith: MUSEUM_MEMORY_PREFIX },
    },
    select: { id: true, notes: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 240,
  });

  const decoded = records
    .map((record) => {
      const memory = decodeMuseMemory(record.notes);
      return memory ? { id: record.id, memory } : null;
    })
    .filter((record): record is { id: string; memory: StoredMuseMemory } => Boolean(record));

  const routedMemories = decoded
    .filter(({ memory }) => memory.museId !== targetMuseId)
    .filter(({ memory }) => memory.kind === "outcome" || memory.kind === "lesson")
    .filter(({ memory }) => CATEGORY_ROUTES[memory.category].recipients.includes(targetMuseId))
    .sort((a, b) => outcomeWeight(b.memory.outcomeRating) - outcomeWeight(a.memory.outcomeRating))
    .slice(0, 8)
    .map(({ id, memory }) => ({
      id,
      sourceMuseId: memory.museId,
      memory,
      relevance: CATEGORY_ROUTES[memory.category].reason,
    }));

  const categories = Object.keys(CATEGORY_ROUTES) as ProposalCategory[];
  const patterns = categories
    .filter((category) => CATEGORY_ROUTES[category].recipients.includes(targetMuseId))
    .map((category) => makePattern(
      category,
      decoded.map(({ memory }) => memory).filter((memory) => memory.category === category && memory.museId !== targetMuseId),
    ))
    .filter((pattern): pattern is CouncilPattern => Boolean(pattern))
    .sort((a, b) => b.sampleSize - a.sampleSize)
    .slice(0, 5);

  return { targetMuseId, routedMemories, patterns };
}

export async function readSharedCategoryContext(db: CognitionDb, targetMuseId: MuseId, category: ProposalCategory) {
  const cognition = await readSharedCouncilCognition(db, targetMuseId);
  const pattern = cognition.patterns.find((item) => item.category === category) ?? null;
  if (!pattern) return null;
  return `Shared Council context: ${pattern.summary}`;
}
