import { Prisma, ProjectStatus, ProjectType } from "../app/generated/prisma/client";
import { MUSE_IDS, type MuseId } from "./museum";
import type { ProposalCategory } from "./museum-proposal-storage";
import { knowledgeEligibleForMuse } from "./museum-knowledge-policy";

export const MUSEUM_KNOWLEDGE_PREFIX = "MUSEUM_KNOWLEDGE_V1:";

export type KnowledgeKind = "artist_directive" | "decision" | "verified_fact" | "reference" | "working_context";
export type KnowledgeSource = "nine_muses_project" | "wizard_os" | "artist" | "import";

export type StoredCouncilKnowledge = {
  version: 1;
  title: string;
  content: string;
  kind: KnowledgeKind;
  source: KnowledgeSource;
  sourceRef: string;
  category: ProposalCategory | null;
  targetMuseIds: MuseId[];
  tags: string[];
  verifiedByArtist: boolean;
  createdAt: string;
};

export type CouncilKnowledgeRecord = StoredCouncilKnowledge & { id: string };

type KnowledgeDb = Pick<Prisma.TransactionClient, "project">;

const KINDS = new Set<KnowledgeKind>(["artist_directive", "decision", "verified_fact", "reference", "working_context"]);
const SOURCES = new Set<KnowledgeSource>(["nine_muses_project", "wizard_os", "artist", "import"]);
const CATEGORIES = new Set<ProposalCategory>(["revenue", "product", "content", "system", "risk", "research", "capacity", "experiment"]);

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function list(value: unknown, maxItems: number, maxText: number) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => text(item, maxText)).filter(Boolean).slice(0, maxItems);
}

export function encodeCouncilKnowledge(entry: StoredCouncilKnowledge) {
  return `${MUSEUM_KNOWLEDGE_PREFIX}${JSON.stringify(entry)}`;
}

export function decodeCouncilKnowledge(notes: string | null): StoredCouncilKnowledge | null {
  if (!notes?.startsWith(MUSEUM_KNOWLEDGE_PREFIX)) return null;
  try {
    const parsed = JSON.parse(notes.slice(MUSEUM_KNOWLEDGE_PREFIX.length)) as Record<string, unknown>;
    if (Number(parsed.version) !== 1 || !KINDS.has(parsed.kind as KnowledgeKind) || !SOURCES.has(parsed.source as KnowledgeSource)) return null;
    const title = text(parsed.title, 180);
    const content = text(parsed.content, 4000);
    const sourceRef = text(parsed.sourceRef, 300);
    const category = parsed.category == null ? null : CATEGORIES.has(parsed.category as ProposalCategory) ? parsed.category as ProposalCategory : null;
    const targetMuseIds = list(parsed.targetMuseIds, 9, 40).filter((value): value is MuseId => (MUSE_IDS as readonly string[]).includes(value));
    const tags = list(parsed.tags, 14, 60);
    const created = new Date(typeof parsed.createdAt === "string" ? parsed.createdAt : "");
    if (!title || !content || !sourceRef || Number.isNaN(created.getTime())) return null;
    return {
      version: 1,
      title,
      content,
      kind: parsed.kind as KnowledgeKind,
      source: parsed.source as KnowledgeSource,
      sourceRef,
      category,
      targetMuseIds,
      tags,
      verifiedByArtist: Boolean(parsed.verifiedByArtist),
      createdAt: created.toISOString(),
    };
  } catch {
    return null;
  }
}

export async function recordCouncilKnowledge(db: KnowledgeDb, input: Omit<StoredCouncilKnowledge, "version" | "createdAt"> & { createdAt?: Date }) {
  const sourceRef = input.sourceRef.trim().slice(0, 300);
  const title = input.title.trim().slice(0, 180);
  const content = input.content.trim().slice(0, 4000);
  if (!title || !content || !sourceRef) throw new Error("Knowledge requires title, content, and provenance.");

  const existing = await db.project.findMany({
    where: { type: ProjectType.INTERNAL, archivedAt: null, notes: { startsWith: MUSEUM_KNOWLEDGE_PREFIX } },
    select: { id: true, notes: true },
    take: 240,
  });
  for (const item of existing) {
    const decoded = decodeCouncilKnowledge(item.notes);
    if (decoded?.sourceRef === sourceRef && decoded.title === title) return { id: item.id, knowledge: decoded, created: false };
  }

  const knowledge: StoredCouncilKnowledge = {
    version: 1,
    title,
    content,
    kind: input.kind,
    source: input.source,
    sourceRef,
    category: input.category,
    targetMuseIds: [...new Set(input.targetMuseIds)].slice(0, 9),
    tags: [...new Set(input.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))].slice(0, 14),
    verifiedByArtist: input.verifiedByArtist,
    createdAt: (input.createdAt ?? new Date()).toISOString(),
  };

  const record = await db.project.create({
    data: {
      title: `[Council Knowledge] ${knowledge.title}`,
      type: ProjectType.INTERNAL,
      status: knowledge.verifiedByArtist ? ProjectStatus.COMPLETE : ProjectStatus.WAITING,
      progress: knowledge.verifiedByArtist ? 100 : 0,
      nextAction: knowledge.verifiedByArtist ? "Available to selective Muse intelligence" : "Await Artist verification in Knowledge Inbox",
      notes: encodeCouncilKnowledge(knowledge),
    },
    select: { id: true },
  });

  return { id: record.id, knowledge, created: true };
}

export async function listCouncilKnowledge(db: KnowledgeDb): Promise<CouncilKnowledgeRecord[]> {
  const rows = await db.project.findMany({
    where: { type: ProjectType.INTERNAL, archivedAt: null, notes: { startsWith: MUSEUM_KNOWLEDGE_PREFIX } },
    select: { id: true, notes: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 240,
  });
  return rows.map((row) => {
    const decoded = decodeCouncilKnowledge(row.notes);
    return decoded ? { id: row.id, ...decoded } : null;
  }).filter((entry): entry is CouncilKnowledgeRecord => Boolean(entry));
}

export async function verifyCouncilKnowledge(db: KnowledgeDb, id: string) {
  const row = await db.project.findFirst({
    where: { id, type: ProjectType.INTERNAL, archivedAt: null, notes: { startsWith: MUSEUM_KNOWLEDGE_PREFIX } },
    select: { id: true, notes: true },
  });
  const knowledge = row ? decodeCouncilKnowledge(row.notes) : null;
  if (!row || !knowledge) throw new Error("Knowledge capsule not found.");
  if (knowledge.verifiedByArtist) return { id, knowledge, changed: false };

  const verified: StoredCouncilKnowledge = { ...knowledge, verifiedByArtist: true };
  await db.project.update({
    where: { id },
    data: {
      status: ProjectStatus.COMPLETE,
      progress: 100,
      nextAction: "Available to selective Muse intelligence",
      notes: encodeCouncilKnowledge(verified),
    },
  });
  return { id, knowledge: verified, changed: true };
}

export async function archiveCouncilKnowledge(db: KnowledgeDb, id: string) {
  const row = await db.project.findFirst({
    where: { id, type: ProjectType.INTERNAL, archivedAt: null, notes: { startsWith: MUSEUM_KNOWLEDGE_PREFIX } },
    select: { id: true, notes: true },
  });
  const knowledge = row ? decodeCouncilKnowledge(row.notes) : null;
  if (!row || !knowledge) throw new Error("Knowledge capsule not found.");
  await db.project.update({
    where: { id },
    data: {
      status: ProjectStatus.ARCHIVED,
      progress: 0,
      archivedAt: new Date(),
      nextAction: "Archived by the Artist; excluded from Muse retrieval",
    },
  });
  return { id, knowledge };
}

const KIND_WEIGHT: Record<KnowledgeKind, number> = {
  artist_directive: 10,
  decision: 8,
  verified_fact: 6,
  reference: 4,
  working_context: 2,
};

export async function readRelevantCouncilKnowledge(db: KnowledgeDb, museId: MuseId, category: ProposalCategory, limit = 8) {
  const all = await listCouncilKnowledge(db);
  return all
    .filter((entry) => knowledgeEligibleForMuse(entry, museId))
    .map((entry) => ({
      entry,
      score: KIND_WEIGHT[entry.kind]
        + (entry.category === category ? 6 : entry.category == null ? 2 : 0)
        + (entry.targetMuseIds.includes(museId) ? 3 : 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ entry }) => entry);
}
