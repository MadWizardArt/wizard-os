import { MUSE_BY_ID } from "./museum-directory";
import type { MuseId } from "./museum";
import type { ChamberMessage } from "./museum-chamber-storage";

export type ChamberProjectContext = {
  id: string;
  title: string;
  type: string;
  status: string;
  progress: number;
  nextAction: string | null;
};

export type ChamberQuestContext = {
  id: string;
  title: string;
  status: string;
  role: string;
  brief: string;
  recentActivity: string[];
  pendingApprovals: number;
};

const DEFAULT_MODEL = "openai/gpt-5.6-terra";

const PERSONA_DIRECTIVES: Record<MuseId, string> = {
  callista: "Lead with strategy, priorities, sequencing, tradeoffs, portfolio coherence, career direction, pricing philosophy, partnerships and long-horizon consequences. Challenge attractive distractions when they weaken the larger plan.",
  aurelia: "Lead with art direction, fine-art presentation, branding, composition, color, typography, photography styling, portfolio curation, emotional resonance and desirability. Be warm, cultivated, sensory and gently exacting.",
  lyra: "Lead with content strategy, narrative, hooks, pacing, YouTube and short-form publishing, voiceover, editorial rhythm, audience clarity and repeatable content systems. Be vivid, practical and concise.",
  cleo: "Lead with records, provenance, money, pricing, margins, cash flow, treasury discipline and measurable business outcomes. Separate known numbers from estimates and identify missing financial evidence.",
  novy: "Lead with systems architecture, Wizard OS, automation, technical implementation, workflows, dependencies, decision architecture and cross-Muse orchestration. Prefer simple durable systems over clever complexity.",
  seraphine: "Lead with scholarship, research, evidence, interpretation, symbolism, purpose, academic rigor, source quality and meaning. Clearly distinguish verified facts, inference and open research questions.",
  tessa: "Lead with routines, logistics, scheduling, ergonomics, workspace flow, sustainable execution, travel practicality and operational friction. Make plans livable rather than theoretically perfect.",
  thalia: "Lead with divergent creativity, experiments, naming, playful marketing, unexpected products, conceptual reframing and pattern interruption. Generate original options, then identify what is worth testing.",
  melina: "Lead with risk analysis, quality assurance, pre-mortems, failure modes, safeguards, health and vitality considerations, and decision hygiene. Be calm, surgical and proportionate about risk.",
};

function projectSummary(projects: ChamberProjectContext[], focusedProjectId: string | null) {
  if (projects.length === 0) return "No active Wizard OS projects were supplied.";
  return projects.slice(0, 12).map((project) => {
    const focused = project.id === focusedProjectId ? " [FOCUSED CONTEXT]" : "";
    return `- ${project.title}${focused} | ${project.type} | ${project.status} | ${project.progress}% | next: ${project.nextAction ?? "not recorded"}`;
  }).join("\n");
}

function questSummary(quests: ChamberQuestContext[]) {
  if (quests.length === 0) return "No current Museum quests are assigned to this Muse.";
  return quests.slice(0, 8).map((quest) => {
    const activity = quest.recentActivity.length ? ` | recent: ${quest.recentActivity.join(" / ")}` : "";
    return `- ${quest.title} | ${quest.role} | ${quest.status} | pending approvals: ${quest.pendingApprovals}${activity}\n  ${quest.brief || "No brief recorded."}`;
  }).join("\n");
}

export async function generateChamberReply(input: {
  museId: MuseId;
  messages: ChamberMessage[];
  projects: ChamberProjectContext[];
  quests: ChamberQuestContext[];
  focusedProjectId: string | null;
}) {
  const muse = MUSE_BY_ID[input.museId];
  const model = process.env.MUSEUM_AI_MODEL?.trim() || DEFAULT_MODEL;
  const token = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;

  if (!token) {
    return { content: "", model, error: "AI Gateway authentication is not available for this deployment." };
  }

  const system = [
    `You are ${muse.name}, the ${muse.role} inside The Museum, a nine-operator council within Wizard OS.`,
    PERSONA_DIRECTIVES[input.museId],
    "This is your private Chamber conversation with the Artist. Speak naturally and directly in your established voice, but remain a professional operator rather than a fantasy narrator.",
    "You share the same Wizard OS world as the other Muses. Use the supplied projects and Museum quests as current context. Do not claim access to data, files, analytics, websites, tools or conversations that are not supplied here.",
    "Never pretend you executed a system change. You may recommend a next action, suggest creating a quest, or recommend consulting another Muse, but real Wizard OS mutations require the existing approval workflow.",
    "When the Artist asks a simple question, answer simply. When a decision is involved, give a recommendation and the tradeoff. Clearly distinguish facts from assumptions.",
  ].join(" ");

  const worldContext = [
    "CURRENT WIZARD OS PROJECTS:",
    projectSummary(input.projects, input.focusedProjectId),
    "",
    `CURRENT ${muse.name.toUpperCase()} MUSEUM QUESTS:`,
    questSummary(input.quests),
  ].join("\n");

  const history = input.messages.slice(-18).map((message) => ({
    role: message.role === "USER" ? "user" as const : "assistant" as const,
    content: message.content || (message.error ? `[Previous response error: ${message.error}]` : ""),
  })).filter((message) => message.content);

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
        max_tokens: 1200,
        messages: [
          { role: "system", content: system },
          { role: "system", content: worldContext },
          ...history,
        ],
      }),
    });

    const payload = await response.json() as {
      model?: string;
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };

    if (!response.ok) {
      return { content: "", model, error: payload.error?.message || `AI Gateway returned ${response.status}.` };
    }

    const content = payload.choices?.[0]?.message?.content?.trim() ?? "";
    if (!content) return { content: "", model: payload.model ?? model, error: "The Muse returned an empty response." };
    return { content: content.slice(0, 6000), model: payload.model ?? model, error: "" };
  } catch (error) {
    return {
      content: "",
      model,
      error: error instanceof Error ? error.message.slice(0, 500) : "Muse response generation failed.",
    };
  }
}
