import { Prisma, ProjectStatus, ProjectType } from "../app/generated/prisma/client";
import type { MuseId } from "./museum";
import type { ProposalCategory } from "./museum-proposal-storage";
import { MUSE_AGENT_CHARTERS, STAGE_THREE_POLICY } from "./museum-agent-charters";
import { readRelevantCouncilKnowledge } from "./museum-knowledge";
import { readSharedCouncilCognition } from "./museum-agent-cognition";

export const MUSEUM_INTELLIGENCE_PREFIX = "MUSEUM_INTELLIGENCE_V1:";

export type IntelligenceQuestStatus = "candidate" | "completed" | "failed" | "declined";

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
  usage: { inputTokens: number | null; outputTokens: number | null; totalTokens: number | null } | null;
  contextRefs: string[];
  createdAt: string;
  executedAt: string | null;
};

export type IntelligenceQuestRecord = StoredIntelligenceQuest & { id: string };

type IntelligenceDb = Pick<Prisma.TransactionClient, "project">;

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

  const quest: StoredIntelligenceQuest = {
    version: 1,
    museId: input.museId,
    category: input.category,
    question,
    reason,
    expectedValue,
    status: "candidate",
    model: null,
    maxOutputTokens: Math.min(Math.max(input.maxOutputTokens ?? 900, 300), 1600),
    answer: null,
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

export async function runIntelligenceQuest(db: IntelligenceDb, id: string) {
  if (process.env.MUSE_INTELLIGENCE_ENABLED !== "true") {
    throw new Error("Selective Intelligence is installed but AI fuel is locked. Set MUSE_INTELLIGENCE_ENABLED=true after the Artist approves the spend gate.");
  }

  const auth = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;
  if (!auth) throw new Error("No AI Gateway credential is available to Wizard OS.");

  const row = await db.project.findFirst({
    where: { id, type: ProjectType.INTERNAL, notes: { startsWith: MUSEUM_INTELLIGENCE_PREFIX } },
    select: { id: true, notes: true },
  });
  const quest = row ? decodeIntelligenceQuest(row.notes) : null;
  if (!row || !quest) throw new Error("Intelligence quest not found.");
  if (quest.status !== "candidate") throw new Error("Only candidate quests can be fueled.");

  const charter = MUSE_AGENT_CHARTERS[quest.museId];
  const knowledge = await readRelevantCouncilKnowledge(db, quest.museId, quest.category, 8);
  const cognition = await readSharedCouncilCognition(db, quest.museId);
  const relevantMemories = cognition.routedMemories.filter((item) => item.memory.category === quest.category).slice(0, 5);
  const relevantPatterns = cognition.patterns.filter((item) => item.category === quest.category).slice(0, 3);

  const knowledgeBlock = knowledge.length
    ? knowledge.map((entry, index) => `${index + 1}. [${entry.kind}] ${entry.title}: ${entry.content}\nSource: ${entry.sourceRef}`).join("\n\n")
    : "No stored Council knowledge matched this quest.";
  const memoryBlock = relevantMemories.length
    ? relevantMemories.map((item, index) => `${index + 1}. ${item.sourceMuseId}: ${item.memory.summary}${item.memory.actualValue ? ` | Actual value: ${item.memory.actualValue}` : ""}`).join("\n")
    : "No routed cross-Muse outcomes yet.";
  const patternBlock = relevantPatterns.length ? relevantPatterns.map((item) => item.summary).join("\n") : "No Council-level pattern has enough evidence yet.";

  const model = process.env.MUSE_INTELLIGENCE_MODEL || "openai/gpt-5.6-sol";
  const system = `You are ${quest.museId}, an accountable specialist in Brandon's Nine Muses council inside Wizard OS. Mission: ${charter.mission}\nEconomic objective: ${charter.economicObjective}\nCreative objective: ${charter.creativeObjective}\nCouncil policy: ${STAGE_THREE_POLICY.objective} ${STAGE_THREE_POLICY.authority}\nYou are not autonomous. Produce one decision-useful synthesis for Brandon. Separate evidence, inference, assumptions, and unknowns. Do not claim that actions were executed. Prefer a concrete next move over generic advice.`;
  const user = `INTELLIGENCE QUEST\nQuestion: ${quest.question}\nWhy this merits AI: ${quest.reason}\nExpected value: ${quest.expectedValue}\n\nRELEVANT KNOWLEDGE VAULT\n${knowledgeBlock}\n\nROUTED COUNCIL EVIDENCE\n${memoryBlock}\n\nCOUNCIL PATTERNS\n${patternBlock}\n\nReturn a compact response with: Insight, Recommendation, Evidence used, Unknowns, and Proposed next step for Artist approval.`;

  const response = await fetch("https://ai-gateway.vercel.sh/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth}` },
    body: JSON.stringify({
      model,
      input: [
        { type: "message", role: "system", content: system },
        { type: "message", role: "user", content: user },
      ],
      max_output_tokens: quest.maxOutputTokens,
      reasoning: { effort: "low" },
    }),
  });

  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message || `AI Gateway returned ${response.status}.`);
  const answer = outputText(payload);
  if (!answer) throw new Error("The intelligence quest returned no readable synthesis.");

  const completed: StoredIntelligenceQuest = {
    ...quest,
    status: "completed",
    model,
    answer: answer.slice(0, 12000),
    usage: {
      inputTokens: typeof payload?.usage?.input_tokens === "number" ? payload.usage.input_tokens : null,
      outputTokens: typeof payload?.usage?.output_tokens === "number" ? payload.usage.output_tokens : null,
      totalTokens: typeof payload?.usage?.total_tokens === "number" ? payload.usage.total_tokens : null,
    },
    contextRefs: [
      ...knowledge.map((entry) => entry.sourceRef),
      ...relevantMemories.map((item) => `Muse memory:${item.id}`),
      ...relevantPatterns.map((item) => `Council pattern:${item.category}:${item.kind}`),
    ].slice(0, 18),
    executedAt: new Date().toISOString(),
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
}
