import { Prisma, ProjectStatus, ProjectType } from "../app/generated/prisma/client";
import type { MuseId } from "./museum";
import type { ProposalCategory } from "./museum-proposal-storage";
import { MUSE_AGENT_CHARTERS, STAGE_THREE_POLICY } from "./museum-agent-charters";
import { readRelevantCouncilKnowledge } from "./museum-knowledge";
import { readSharedCouncilCognition } from "./museum-agent-cognition";
import { intelligenceBudget, intelligenceFuelEnabled } from "./museum-artist-auth";
import { buildIntelligenceContextPacket } from "./museum-intelligence-context";

export const MUSEUM_INTELLIGENCE_PREFIX = "MUSEUM_INTELLIGENCE_V1:";

export type IntelligenceQuestStatus = "candidate" | "running" | "completed" | "failed" | "declined";

export type StoredIntelligenceQuest = {
  version: 1;
  museId: MuseId;
  category: ProposalCategory;
  question: string;
  reason: string;
  expectedValue: string;
  status: IntelligenceQuestStatus;
  model: string | null;
  maxOutputTokens: number;
  answer: string | null;
  error?: string | null;
  usage: { inputTokens: number | null; outputTokens: number | null; totalTokens: number | null } | null;
  contextRefs: string[];
  createdAt: string;
  executedAt: string | null;
};

export type IntelligenceQuestRecord = StoredIntelligenceQuest & { id: string };
export type IntelligenceFuelUsage = {
  date: string;
  completedRuns: number;
  activeRuns: number;
  usedTokens: number;
  maxRuns: number;
  dailyTokens: number;
  remainingRuns: number;
  remainingTokens: number;
  maxOutputTokens: number;
};

type IntelligenceDb = Pick<Prisma.TransactionClient, "project" | "painting" | "artworkSale" | "campaign" | "venture">;

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function encodeIntelligenceQuest(quest: StoredIntelligenceQuest) {
  return `${MUSEUM_INTELLIGENCE_PREFIX}${JSON.stringify(quest)}`;
}

export function decodeIntelligenceQuest(notes: string | null): StoredIntelligenceQuest | null {
  if (!notes?.startsWith(MUSEUM_INTELLIGENCE_PREFIX)) return null;
  try {
    const parsed = JSON.parse(notes.slice(MUSEUM_INTELLIGENCE_PREFIX.length)) as StoredIntelligenceQuest;
    if (parsed.version !== 1 || !parsed.museId || !parsed.category || !parsed.question || !parsed.reason || !parsed.expectedValue) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function createIntelligenceQuest(db: IntelligenceDb, input: {
  museId: MuseId;
  category: ProposalCategory;
  question: string;
  reason: string;
  expectedValue: string;
  maxOutputTokens?: number;
}) {
  const question = text(input.question, 1200);
  const reason = text(input.reason, 700);
  const expectedValue = text(input.expectedValue, 400);
  if (!question || !reason || !expectedValue) throw new Error("Intelligence quest requires a question, reason, and expected value.");
  const budget = intelligenceBudget();

  const quest: StoredIntelligenceQuest = {
    version: 1,
    museId: input.museId,
    category: input.category,
    question,
    reason,
    expectedValue,
    status: "candidate",
    model: null,
    maxOutputTokens: Math.min(Math.max(input.maxOutputTokens ?? 900, 300), budget.maxOutputTokens),
    answer: null,
    error: null,
    usage: null,
    contextRefs: [],
    createdAt: new Date().toISOString(),
    executedAt: null,
  };

  const record = await db.project.create({
    data: {
      title: `[Intelligence Quest] ${question.slice(0, 90)}`,
      type: ProjectType.INTERNAL,
      status: ProjectStatus.WAITING,
      progress: 0,
      nextAction: "Await Artist token-spend decision",
      notes: encodeIntelligenceQuest(quest),
    },
    select: { id: true },
  });
  return { id: record.id, quest };
}

export async function listIntelligenceQuests(db: IntelligenceDb): Promise<IntelligenceQuestRecord[]> {
  const rows = await db.project.findMany({
    where: { type: ProjectType.INTERNAL, notes: { startsWith: MUSEUM_INTELLIGENCE_PREFIX } },
    select: { id: true, notes: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 80,
  });
  return rows.map((row) => {
    const decoded = decodeIntelligenceQuest(row.notes);
    return decoded ? { id: row.id, ...decoded } : null;
  }).filter((item): item is IntelligenceQuestRecord => Boolean(item));
}

export async function readIntelligenceFuelUsage(db: IntelligenceDb): Promise<IntelligenceFuelUsage> {
  const budget = intelligenceBudget();
  const quests = await listIntelligenceQuests(db);
  const date = new Date().toISOString().slice(0, 10);
  const today = quests.filter((quest) => quest.executedAt?.slice(0, 10) === date);
  const completed = today.filter((quest) => quest.status === "completed");
  const active = today.filter((quest) => quest.status === "running");
  const usedTokens = completed.reduce((sum, quest) => sum + (quest.usage?.totalTokens ?? 0), 0);
  return {
    date,
    completedRuns: completed.length,
    activeRuns: active.length,
    usedTokens,
    maxRuns: budget.maxRuns,
    dailyTokens: budget.dailyTokens,
    remainingRuns: Math.max(0, budget.maxRuns - completed.length - active.length),
    remainingTokens: Math.max(0, budget.dailyTokens - usedTokens),
    maxOutputTokens: budget.maxOutputTokens,
  };
}

function outputText(payload: any) {
  const items = Array.isArray(payload?.output) ? payload.output : [];
  const parts: string[] = [];
  for (const item of items) {
    if (item?.type !== "message" || !Array.isArray(item.content)) continue;
    for (const part of item.content) {
      if (part?.type === "output_text" && typeof part.text === "string") parts.push(part.text);
    }
  }
  return parts.join("\n").trim();
}

async function markFailed(db: IntelligenceDb, id: string, quest: StoredIntelligenceQuest, message: string) {
  const failed: StoredIntelligenceQuest = { ...quest, status: "failed", error: text(message, 900) || "Intelligence quest failed." };
  await db.project.update({
    where: { id },
    data: {
      status: ProjectStatus.BLOCKED,
      progress: 0,
      nextAction: "Review intelligence failure before retrying or replacing this quest",
      notes: encodeIntelligenceQuest(failed),
    },
  });
}

export async function runIntelligenceQuest(db: IntelligenceDb, id: string) {
  if (!intelligenceFuelEnabled()) {
    throw new Error("AI fuel is locked. Artist access and MUSE_INTELLIGENCE_ENABLED=true are both required.");
  }

  const auth = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;
  if (!auth) throw new Error("No AI Gateway credential is available to Wizard OS.");

  const usage = await readIntelligenceFuelUsage(db);
  if (usage.remainingRuns <= 0) throw new Error(`Daily intelligence run limit reached (${usage.maxRuns}).`);
  if (usage.remainingTokens <= 0) throw new Error(`Daily intelligence token budget reached (${usage.dailyTokens.toLocaleString()}).`);

  const row = await db.project.findFirst({
    where: { id, type: ProjectType.INTERNAL, notes: { startsWith: MUSEUM_INTELLIGENCE_PREFIX } },
    select: { id: true, notes: true },
  });
  const quest = row ? decodeIntelligenceQuest(row.notes) : null;
  if (!row || !quest || !row.notes) throw new Error("Intelligence quest not found.");
  if (quest.status !== "candidate") throw new Error("Only candidate quests can be fueled.");

  const budget = intelligenceBudget();
  const maxOutputTokens = Math.min(quest.maxOutputTokens, budget.maxOutputTokens);
  if (usage.remainingTokens < maxOutputTokens) throw new Error("Remaining daily token budget is smaller than this quest's output allowance.");

  const running: StoredIntelligenceQuest = {
    ...quest,
    status: "running",
    error: null,
    model: process.env.MUSE_INTELLIGENCE_MODEL || "openai/gpt-5.6-sol",
    maxOutputTokens,
    executedAt: new Date().toISOString(),
  };
  const claim = await db.project.updateMany({
    where: { id, notes: row.notes },
    data: {
      status: ProjectStatus.ACTIVE,
      progress: 10,
      nextAction: "Bounded Muse synthesis in progress",
      notes: encodeIntelligenceQuest(running),
    },
  });
  if (claim.count !== 1) throw new Error("This intelligence quest was already claimed by another request.");

  try {
    const charter = MUSE_AGENT_CHARTERS[running.museId];
    const [knowledge, cognition, liveContext] = await Promise.all([
      readRelevantCouncilKnowledge(db, running.museId, running.category, 8),
      readSharedCouncilCognition(db, running.museId),
      buildIntelligenceContextPacket(db, running.museId, running.category),
    ]);
    const relevantMemories = cognition.routedMemories.filter((item) => item.memory.category === running.category).slice(0, 5);
    const relevantPatterns = cognition.patterns.filter((item) => item.category === running.category).slice(0, 3);

    const knowledgeBlock = knowledge.length
      ? knowledge.map((entry, index) => `${index + 1}. [${entry.kind}] ${entry.title}: ${entry.content}\nSource: ${entry.sourceRef}`).join("\n\n")
      : "No stored Council knowledge matched this quest.";
    const memoryBlock = relevantMemories.length
      ? relevantMemories.map((item, index) => `${index + 1}. ${item.sourceMuseId}: ${item.memory.summary}${item.memory.actualValue ? ` | Actual value: ${item.memory.actualValue}` : ""}`).join("\n")
      : "No routed cross-Muse outcomes yet.";
    const patternBlock = relevantPatterns.length ? relevantPatterns.map((item) => item.summary).join("\n") : "No Council-level pattern has enough evidence yet.";

    const model = running.model || "openai/gpt-5.6-sol";
    const system = `You are ${running.museId}, an accountable specialist in Brandon's Nine Muses council inside Wizard OS. Mission: ${charter.mission}\nEconomic objective: ${charter.economicObjective}\nCreative objective: ${charter.creativeObjective}\nCouncil policy: ${STAGE_THREE_POLICY.objective} ${STAGE_THREE_POLICY.authority}\nYou are not autonomous. Produce one decision-useful synthesis for Brandon. Separate evidence, inference, assumptions, and unknowns. Do not claim that actions were executed. Prefer a concrete next move over generic advice.`;
    const user = `INTELLIGENCE QUEST\nQuestion: ${running.question}\nWhy this merits AI: ${running.reason}\nExpected value: ${running.expectedValue}\n\nLIVE WIZARD OS CONTEXT · generated ${liveContext.generatedAt}\n${liveContext.text}\n\nRELEVANT KNOWLEDGE VAULT\n${knowledgeBlock}\n\nROUTED COUNCIL EVIDENCE\n${memoryBlock}\n\nCOUNCIL PATTERNS\n${patternBlock}\n\nReturn a compact response with: Insight, Recommendation, Evidence used, Unknowns, and Proposed next step for Artist approval.`;

    const response = await fetch("https://ai-gateway.vercel.sh/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth}` },
      body: JSON.stringify({
        model,
        input: [
          { type: "message", role: "system", content: system },
          { type: "message", role: "user", content: user },
        ],
        max_output_tokens: maxOutputTokens,
        reasoning: { effort: "low" },
        providerOptions: { gateway: { user: "artist", tags: ["nine-muses", running.museId, running.category] } },
      }),
    });

    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error?.message || `AI Gateway returned ${response.status}.`);
    const answer = outputText(payload);
    if (!answer) throw new Error("The intelligence quest returned no readable synthesis.");

    const completed: StoredIntelligenceQuest = {
      ...running,
      status: "completed",
      model,
      answer: answer.slice(0, 12000),
      error: null,
      usage: {
        inputTokens: typeof payload?.usage?.input_tokens === "number" ? payload.usage.input_tokens : null,
        outputTokens: typeof payload?.usage?.output_tokens === "number" ? payload.usage.output_tokens : null,
        totalTokens: typeof payload?.usage?.total_tokens === "number" ? payload.usage.total_tokens : null,
      },
      contextRefs: [
        ...liveContext.refs.map((ref) => `Live state:${ref}`),
        ...knowledge.map((entry) => entry.sourceRef),
        ...relevantMemories.map((item) => `Muse memory:${item.id}`),
        ...relevantPatterns.map((item) => `Council pattern:${item.category}:${item.kind}`),
      ].slice(0, 24),
    };

    await db.project.update({
      where: { id },
      data: {
        status: ProjectStatus.COMPLETE,
        progress: 100,
        nextAction: "Bring synthesis to the Artist; no action is committed automatically",
        notes: encodeIntelligenceQuest(completed),
      },
    });

    return { id, ...completed };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Intelligence quest failed.";
    await markFailed(db, id, running, message);
    throw error;
  }
}
