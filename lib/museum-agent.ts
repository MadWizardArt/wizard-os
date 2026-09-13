import { MUSE_BY_ID } from "./museum-directory";
import type { MuseId } from "./museum";
import type { MuseActionEvent, MuseResponse, StoredMuseumQuest } from "./museum-quest-storage";

export type MuseumLinkedProjectContext = {
  id: string;
  title: string;
  type: string;
  status: string;
  progress: number;
  nextAction: string | null;
} | null;

const DEFAULT_MODEL = "openai/gpt-5.6-terra";

const PERSONA_DIRECTIVES: Record<MuseId, string> = {
  callista: "Lead with strategy, prioritization, tradeoffs, sequencing, portfolio coherence, and long-horizon consequences. Challenge attractive distractions when they weaken the larger plan.",
  aurelia: "Lead with art direction, fine-art presentation, branding, composition, color, typography, photography styling, emotional resonance, and desirability. Be warm, cultivated, sensory, and gently exacting.",
  lyra: "Lead with content strategy, narrative, hooks, pacing, YouTube and short-form publishing, editorial rhythm, audience clarity, and repeatable content systems. Be vivid, practical, and concise.",
  cleo: "Lead with money, pricing, margins, cash flow, financial records, treasury discipline, provenance, and measurable business outcomes. Separate known numbers from estimates and call out missing financial evidence.",
  novy: "Lead with systems architecture, Wizard OS, automation, technical implementation, workflows, orchestration, dependencies, and maintainability. Prefer simple durable systems over clever complexity.",
  seraphine: "Lead with scholarship, research, evidence, interpretation, symbolism, academic rigor, source quality, and meaning. Clearly distinguish verified facts, inference, and open research questions.",
  tessa: "Lead with routines, logistics, scheduling, ergonomics, home and workspace flow, travel practicality, sustainable execution, and operational friction. Make plans livable rather than theoretically perfect.",
  thalia: "Lead with divergent creativity, experiments, naming, playful marketing, unexpected products, conceptual reframing, and pattern interruption. Generate original options, then identify which are worth testing.",
  melina: "Lead with risk analysis, quality assurance, pre-mortems, health and vitality considerations, failure modes, safeguards, and decision hygiene. Be calm, surgical, and proportionate about risk.",
};

const ACTION_DIRECTIVES: Record<MuseActionEvent["type"], string> = {
  CONSULT: "Respond to the consultation directly from your specialty. Give a recommendation, the reasoning behind it, and the next useful action.",
  DELEGATE: "You have been delegated part of this quest. Confirm what you understand the assignment to be, then give an initial plan or deliverable direction from your specialty.",
  HANDOFF: "You are receiving Lead ownership of this quest. State how you will take over, what matters first, and any risk or missing context you would resolve next.",
  REVIEW: "Perform a focused review. Identify what works, what should change, and give a clear verdict or recommendation rather than vague encouragement.",
  CHALLENGE: "Respond to the challenge seriously. Agree where warranted, disagree where necessary, explain the tradeoff, and state what decision you recommend.",
  ESCALATE: "Prepare a concise escalation memo for the Artist: what is unresolved, the realistic options, the tradeoff, your recommendation, and exactly what decision is needed.",
  CONVENE: "Give your own domain-specific Council position on this quest. Do not impersonate or summarize the other Muses; contribute the perspective only your portfolio should add.",
};

function responseMuseIds(quest: StoredMuseumQuest, event: MuseActionEvent): MuseId[] {
  if (event.type === "CONVENE") return quest.assignments.map((assignment) => assignment.museId);
  if (event.type === "ESCALATE") return [event.actorMuseId];
  return event.targetMuseId ? [event.targetMuseId] : [event.actorMuseId];
}

function recentHistory(quest: StoredMuseumQuest, currentEventId: string) {
  return quest.events
    .filter((event) => event.id !== currentEventId)
    .slice(-8)
    .map((event) => {
      const actor = MUSE_BY_ID[event.actorMuseId]?.name ?? event.actorMuseId;
      const target = event.targetMuseId ? MUSE_BY_ID[event.targetMuseId]?.name ?? event.targetMuseId : "Artist/Council";
      const responseSummary = event.responses
        .filter((response) => response.status === "COMPLETE" && response.text)
        .map((response) => `${MUSE_BY_ID[response.museId]?.name ?? response.museId}: ${response.text.slice(0, 450)}`)
        .join(" | ");
      return `${event.type}: ${actor} → ${target}${event.message ? ` — ${event.message}` : ""}${responseSummary ? `\nResponse: ${responseSummary}` : ""}`;
    })
    .join("\n\n");
}

function buildUserPrompt(
  responderId: MuseId,
  quest: StoredMuseumQuest,
  event: MuseActionEvent,
  project: MuseumLinkedProjectContext,
) {
  const actor = MUSE_BY_ID[event.actorMuseId]?.name ?? event.actorMuseId;
  const target = event.targetMuseId ? MUSE_BY_ID[event.targetMuseId]?.name ?? event.targetMuseId : "the Council";
  const roster = quest.assignments
    .map((assignment) => `${MUSE_BY_ID[assignment.museId]?.name ?? assignment.museId} (${assignment.role})`)
    .join(", ");
  const history = recentHistory(quest, event.id);

  return [
    `QUEST: ${quest.title}`,
    `STATUS: ${quest.status}`,
    `BRIEF: ${quest.brief || "No brief recorded."}`,
    `ROSTER: ${roster}`,
    project
      ? `LINKED WIZARD OS PROJECT: ${project.title} | type ${project.type} | status ${project.status} | progress ${project.progress}% | next action ${project.nextAction ?? "not recorded"}`
      : "LINKED WIZARD OS PROJECT: none",
    history ? `RECENT COUNCIL HISTORY:\n${history}` : "RECENT COUNCIL HISTORY: none",
    `CURRENT ACTION: ${event.type}`,
    `ACTOR: ${actor}`,
    `TARGET: ${target}`,
    `INSTRUCTION / REASON: ${event.message || "No additional note supplied."}`,
    `YOU ARE RESPONDING AS: ${MUSE_BY_ID[responderId]?.name ?? responderId}`,
    ACTION_DIRECTIVES[event.type],
  ].join("\n\n");
}

async function generateOne(
  museId: MuseId,
  quest: StoredMuseumQuest,
  event: MuseActionEvent,
  project: MuseumLinkedProjectContext,
): Promise<MuseResponse> {
  const muse = MUSE_BY_ID[museId];
  const model = process.env.MUSEUM_AI_MODEL?.trim() || DEFAULT_MODEL;
  const token = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;
  const createdAt = new Date().toISOString();

  if (!token) {
    return {
      museId,
      status: "ERROR",
      text: "",
      model,
      createdAt,
      error: "AI Gateway authentication is not available for this deployment.",
    };
  }

  const system = [
    `You are ${muse.name}, the ${muse.role} inside The Museum, a nine-operator council within Wizard OS.`,
    PERSONA_DIRECTIVES[museId],
    "Stay distinct from the other Muses. Answer as a professional operator, not as a fantasy narrator.",
    "Use only the context provided. Never claim you inspected files, analytics, websites, accounts, or tools unless that evidence appears in the prompt.",
    "Clearly distinguish verified context from assumptions. If important information is missing, say what is missing without stalling the response.",
    "Be concise but substantive. Prefer a decision, recommendation, critique, or concrete next action over generic encouragement.",
  ].join(" ");

  try {
    const response = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        stream: false,
        max_tokens: 900,
        messages: [
          { role: "system", content: system },
          { role: "user", content: buildUserPrompt(museId, quest, event, project) },
        ],
      }),
    });

    const payload = await response.json() as {
      model?: string;
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };

    if (!response.ok) {
      return {
        museId,
        status: "ERROR",
        text: "",
        model,
        createdAt,
        error: payload.error?.message || `AI Gateway returned ${response.status}.`,
      };
    }

    const text = payload.choices?.[0]?.message?.content?.trim() ?? "";
    if (!text) {
      return { museId, status: "ERROR", text: "", model: payload.model ?? model, createdAt, error: "The Muse returned an empty response." };
    }

    return {
      museId,
      status: "COMPLETE",
      text: text.slice(0, 3000),
      model: payload.model ?? model,
      createdAt,
      error: "",
    };
  } catch (error) {
    return {
      museId,
      status: "ERROR",
      text: "",
      model,
      createdAt,
      error: error instanceof Error ? error.message.slice(0, 500) : "Muse response generation failed.",
    };
  }
}

export async function generateMuseResponses(
  quest: StoredMuseumQuest,
  event: MuseActionEvent,
  project: MuseumLinkedProjectContext,
): Promise<MuseResponse[]> {
  const museIds = [...new Set(responseMuseIds(quest, event))];
  return Promise.all(museIds.map((museId) => generateOne(museId, quest, event, project)));
}
