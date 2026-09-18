import { Prisma } from "../app/generated/prisma/client";
import type { MuseId } from "./museum";
import type { ProposalCategory } from "./museum-proposal-storage";
import { MUSE_AGENT_CHARTERS, STAGE_THREE_POLICY } from "./museum-agent-charters";
import { buildMuseMindSystemPrompt, getMuseMindKernel } from "./museum-mind-kernel";
import { formatMuseMindContinuity, readMuseMindContinuity, upsertMuseWorkingState } from "./museum-mind-continuity";
import { readRelevantCouncilKnowledge } from "./museum-knowledge";
import { readSharedCouncilCognition } from "./museum-agent-cognition";
import { intelligenceBudget, intelligenceFuelEnabled } from "./museum-artist-auth";
import { buildIntelligenceContextPacket } from "./museum-intelligence-context";

export const MUSEUM_INTELLIGENCE_PREFIX = "MUSEUM_INTELLIGENCE_V1:";

export type IntelligenceQuestStatus = "candidate" | "running" | "completed" | "failed" | "declined";
export type IntelligenceQuestErrorCode = "gateway_credit" | "gateway_auth" | "model_access" | "budget" | "gateway" | "unknown";

export type IntelligenceFailure = {
  code: IntelligenceQuestErrorCode;
  message: string;
  retryable: boolean;
};

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
  errorCode?: IntelligenceQuestErrorCode | null;
  retryOf?: string | null;
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

type IntelligenceDb = Pick<Prisma.TransactionClient, "project" | "painting" | "artworkSale" | "campaign" | "venture" | "museumIntelligenceQuest">;

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function describeIntelligenceFailure(message: string): IntelligenceFailure {
  const lower = message.toLowerCase();

  if (lower.includes("free tier users do not have access") || lower.includes("top-up") || lower.includes("paid credits") || lower.includes("insufficient credit")) {
    return {
      code: "gateway_credit",
      message: "This model needs AI Gateway credits. Fund or refresh the Vercel Gateway balance, then retry this quest.",
      retryable: true,
    };
  }
  if (lower.includes("no ai gateway credential") || lower.includes("credential") || lower.includes("oidc")) {
    return {
      code: "gateway_auth",
      message: "Wizard OS could not authenticate with AI Gateway. The quest was not completed; check Gateway authentication and retry.",
      retryable: true,
    };
  }
  if (lower.includes("restricted access to this model") || lower.includes("model access") || lower.includes("no providers available")) {
    return {
      code: "model_access",
      message: "The selected model is not currently available to this Vercel team. Choose an available model or update Gateway access, then retry.",
      retryable: true,
    };
  }
  if (lower.includes("daily intelligence") || lower.includes("daily token budget") || lower.includes("run limit")) {
    return {
      code: "budget",
      message: "Today’s Wizard OS intelligence allowance has been reached. No more powered quests can run until the allowance resets or the Artist changes the budget.",
      retryable: true,
    };
  }
  if (lower.includes("ai gateway returned") || lower.includes("gateway")) {
    return {
      code: "gateway",
      message: "AI Gateway could not complete this quest. The failed attempt remains in history and can be retried safely.",
      retryable: true,
    };
  }
  return {
    code: "unknown",
    message: "This quest did not complete. Its failed attempt remains in history and can be retried after the issue is reviewed.",
    retryable: true,
  };
}

export function encodeIntelligenceQuest(quest: StoredIntelligenceQuest) {
  return `${MUSEUM_INTELLIGENCE_PREFIX}${JSON.stringify(quest)}`;
}

export function decodeIntelligenceQuest(payload: string | null): StoredIntelligenceQuest | null {
  if (!payload?.startsWith(MUSEUM_INTELLIGENCE_PREFIX)) return null;
  try {
    const parsed = JSON.parse(payload.slice(MUSEUM_INTELLIGENCE_PREFIX.length)) as StoredIntelligenceQuest;
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
  retryOf?: string | null;
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
    errorCode: null,
    retryOf: input.retryOf ?? null,
    usage: null,
    contextRefs: [],
    createdAt: new Date().toISOString(),
    executedAt: null,
  };

  const record = await db.museumIntelligenceQuest.create({
    data: {
      payload: encodeIntelligenceQuest(quest),
      museId: quest.museId,
      category: quest.category,
      status: quest.status,
      createdAt: new Date(quest.createdAt),
    },
    select: { id: true },
  });
  return { id: record.id, quest };
}

export async function retryIntelligenceQuest(db: IntelligenceDb, id: string) {
  const row = await db.museumIntelligenceQuest.findUnique({
    where: { id },
    select: { payload: true },
  });
  const quest = row ? decodeIntelligenceQuest(row.payload) : null;
  if (!quest) throw new Error("Intelligence quest not found.");
  if (quest.status !== "failed") throw new Error("Only failed intelligence quests can be retried.");

  return createIntelligenceQuest(db, {
    museId: quest.museId,
    category: quest.category,
    question: quest.question,
    reason: quest.reason,
    expectedValue: quest.expectedValue,
    maxOutputTokens: quest.maxOutputTokens,
    retryOf: id,
  });
}

export async function deleteFailedIntelligenceQuest(db: IntelligenceDb, id: string) {
  const row = await db.museumIntelligenceQuest.findUnique({
    where: { id },
    select: { payload: true },
  });
  const quest = row ? decodeIntelligenceQuest(row.payload) : null;
  if (!quest) throw new Error("Intelligence quest not found.");
  if (quest.status !== "failed") throw new Error("Only failed intelligence quests can be deleted.");
  await db.museumIntelligenceQuest.delete({ where: { id } });
  return { id };
}

export async function listIntelligenceQuests(db: IntelligenceDb): Promise<IntelligenceQuestRecord[]> {
  const rows = await db.museumIntelligenceQuest.findMany({
    select: { id: true, payload: true },
    orderBy: { createdAt: "desc" },
    take: 80,
  });
  return rows.map((row) => {
    const decoded = decodeIntelligenceQuest(row.payload);
    if (!decoded) return null;
    if (decoded.status === "failed" && decoded.error) {
      const failure = describeIntelligenceFailure(decoded.error);
      return { id: row.id, ...decoded, error: failure.message, errorCode: decoded.errorCode ?? failure.code };
    }
    return { id: row.id, ...decoded };
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

async function syncIntelligenceWorkingState(
  db: IntelligenceDb,
  id: string,
  quest: StoredIntelligenceQuest,
  status: "active" | "waiting" | "blocked",
  nextAction: string,
  evidenceRefs: string[] = [],
) {
  if (!getMuseMindKernel(quest.museId)) return null;
  try {
    return await upsertMuseWorkingState(db, {
      museId: quest.museId,
      objective: quest.question,
      category: quest.category,
      sourceKey: `intelligence:${id}`,
      status,
      nextAction,
      completionCondition: "The question is resolved by completed and verified work, or this line of work is explicitly superseded.",
      notes: `Why this merits intelligence: ${quest.reason}\nExpected value: ${quest.expectedValue}`,
      evidenceRefs,
    });
  } catch {
    return null;
  }
}

async function markFailed(db: IntelligenceDb, id: string, quest: StoredIntelligenceQuest, message: string) {
  const failure = describeIntelligenceFailure(message);
  const failed: StoredIntelligenceQuest = { ...quest, status: "failed", error: failure.message, errorCode: failure.code };
  await db.museumIntelligenceQuest.update({
    where: { id },
    data: {
      payload: encodeIntelligenceQuest(failed),
      status: failed.status,
    },
  });
}

export async function runIntelligenceQuest(db: IntelligenceDb, id: string, auth: string) {
  if (!intelligenceFuelEnabled()) {
    throw new Error("AI fuel is locked. Artist access and MUSE_INTELLIGENCE_ENABLED=true are both required.");
  }
  if (!auth.trim()) throw new Error("No AI Gateway credential is available to Wizard OS.");

  const usage = await readIntelligenceFuelUsage(db);
  if (usage.remainingRuns <= 0) throw new Error(`Daily intelligence run limit reached (${usage.maxRuns}).`);
  if (usage.remainingTokens <= 0) throw new Error(`Daily intelligence token budget reached (${usage.dailyTokens.toLocaleString()}).`);

  const row = await db.museumIntelligenceQuest.findUnique({
    where: { id },
    select: { id: true, payload: true, status: true },
  });
  const quest = row ? decodeIntelligenceQuest(row.payload) : null;
  if (!row || !quest) throw new Error("Intelligence quest not found.");
  if (quest.status !== "candidate") throw new Error("Only candidate quests can be fueled.");

  const budget = intelligenceBudget();
  const maxOutputTokens = Math.min(quest.maxOutputTokens, budget.maxOutputTokens);
  if (usage.remainingTokens < maxOutputTokens) throw new Error("Remaining daily token budget is smaller than this quest's output allowance.");

  const running: StoredIntelligenceQuest = {
    ...quest,
    status: "running",
    error: null,
    errorCode: null,
    model: process.env.MUSE_INTELLIGENCE_MODEL || "openai/gpt-5.6-sol",
    maxOutputTokens,
    executedAt: new Date().toISOString(),
  };
  const claim = await db.museumIntelligenceQuest.updateMany({
    where: { id, payload: row.payload, status: "candidate" },
    data: {
      payload: encodeIntelligenceQuest(running),
      status: running.status,
    },
  });
  if (claim.count !== 1) throw new Error("This intelligence quest was already claimed by another request.");

  await syncIntelligenceWorkingState(
    db,
    id,
    running,
    "active",
    "Complete the bounded intelligence synthesis and return it for Artist review.",
  );

  try {
    const charter = MUSE_AGENT_CHARTERS[running.museId];
    const mindKernel = getMuseMindKernel(running.museId);
    const [knowledge, cognition, liveContext, personalContinuity] = await Promise.all([
      readRelevantCouncilKnowledge(db, running.museId, running.category, 8),
      readSharedCouncilCognition(db, running.museId),
      buildIntelligenceContextPacket(db, running.museId, running.category),
      mindKernel ? readMuseMindContinuity(db, running.museId) : Promise.resolve(null),
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
    const continuityBlock = personalContinuity ? formatMuseMindContinuity(personalContinuity) : "No persistent personal continuity is enabled for this Muse yet.";
    const responseShape = mindKernel
      ? mindKernel.outputContract.requiredSections.join(", ")
      : "Insight, Recommendation, Evidence used, Unknowns, and Proposed next step for Artist approval";

    const model = running.model || "openai/gpt-5.6-sol";
    const legacySystem = `You are ${running.museId}, an accountable specialist in Brandon's Nine Muses council inside Wizard OS. Mission: ${charter.mission}\nEconomic objective: ${charter.economicObjective}\nCreative objective: ${charter.creativeObjective}\nCouncil policy: ${STAGE_THREE_POLICY.objective} ${STAGE_THREE_POLICY.authority}\nYou are not autonomous. Produce one decision-useful synthesis for Brandon. Separate evidence, inference, assumptions, and unknowns. Do not claim that actions were executed. Prefer a concrete next move over generic advice.`;
    const system = mindKernel
      ? `${buildMuseMindSystemPrompt(mindKernel)}\nCOUNCIL POLICY: ${STAGE_THREE_POLICY.objective} ${STAGE_THREE_POLICY.authority}`
      : legacySystem;
    const user = `INTELLIGENCE QUEST\nQuestion: ${running.question}\nWhy this merits AI: ${running.reason}\nExpected value: ${running.expectedValue}\n\nLIVE WIZARD OS CONTEXT · generated ${liveContext.generatedAt}\n${liveContext.text}\n\nPERSONAL MIND CONTINUITY\n${continuityBlock}\n\nRELEVANT KNOWLEDGE VAULT\n${knowledgeBlock}\n\nROUTED COUNCIL EVIDENCE\n${memoryBlock}\n\nCOUNCIL PATTERNS\n${patternBlock}\n\nReturn a compact response with: ${responseShape}.`;

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
      errorCode: null,
      usage: {
        inputTokens: typeof payload?.usage?.input_tokens === "number" ? payload.usage.input_tokens : null,
        outputTokens: typeof payload?.usage?.output_tokens === "number" ? payload.usage.output_tokens : null,
        totalTokens: typeof payload?.usage?.total_tokens === "number" ? payload.usage.total_tokens : null,
      },
      contextRefs: [
        ...(mindKernel ? [`Muse mind:${mindKernel.museId}:v${mindKernel.version}`] : []),
        ...liveContext.refs.slice(0, 6).map((ref) => `Live state:${ref}`),
        ...(personalContinuity ? personalContinuity.workingStates.slice(0, 4).map((item) => `Working state:${item.id}`) : []),
        ...(personalContinuity ? personalContinuity.durableMemories.slice(0, 4).map((item) => `Personal memory:${item.id}`) : []),
        ...knowledge.slice(0, 4).map((entry) => entry.sourceRef),
        ...relevantMemories.slice(0, 3).map((item) => `Muse memory:${item.id}`),
        ...relevantPatterns.slice(0, 2).map((item) => `Council pattern:${item.category}:${item.kind}`),
      ].slice(0, 24),
    };

    await db.museumIntelligenceQuest.update({
      where: { id },
      data: {
        payload: encodeIntelligenceQuest(completed),
        status: completed.status,
      },
    });

    await syncIntelligenceWorkingState(
      db,
      id,
      completed,
      "waiting",
      "Review the synthesis, execute an approved next action, or explicitly supersede this line of work.",
      [`Intelligence quest:${id}`],
    );

    return { id, ...completed };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Intelligence quest failed.";
    await syncIntelligenceWorkingState(
      db,
      id,
      running,
      "blocked",
      "Resolve the intelligence failure or prepare a retry; do not treat the failed run as a learned outcome.",
      [`Failed intelligence quest:${id}`],
    );
    await markFailed(db, id, running, message);
    throw error;
  }
}