import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { isMuseId } from "../../../../lib/museum";
import type { ProposalCategory } from "../../../../lib/museum-proposal-storage";
import { createIntelligenceQuest, listIntelligenceQuests, runIntelligenceQuest } from "../../../../lib/museum-intelligence";
import { ensureCanonicalNineMusesKnowledge } from "../../../../lib/museum-knowledge-seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CATEGORIES = new Set<ProposalCategory>(["revenue", "product", "content", "system", "risk", "research", "capacity", "experiment"]);

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === request.nextUrl.host;
  } catch {
    return false;
  }
}

export async function GET() {
  await prisma.$transaction(async (tx) => ensureCanonicalNineMusesKnowledge(tx));
  const quests = await listIntelligenceQuests(prisma);
  return NextResponse.json({
    enabled: process.env.MUSE_INTELLIGENCE_ENABLED === "true",
    model: process.env.MUSE_INTELLIGENCE_MODEL || "openai/gpt-5.6-sol",
    quests,
  });
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Cross-origin quest creation is not accepted." }, { status: 403 });
  const body = await request.json();
  if (!isMuseId(body.museId)) return NextResponse.json({ error: "Choose an accountable Muse." }, { status: 400 });
  if (!CATEGORIES.has(body.category as ProposalCategory)) return NextResponse.json({ error: "Choose a valid quest category." }, { status: 400 });

  const question = text(body.question, 1200);
  const reason = text(body.reason, 700);
  const expectedValue = text(body.expectedValue, 400);
  if (!question || !reason || !expectedValue) {
    return NextResponse.json({ error: "Question, reason, and expected value are required." }, { status: 400 });
  }

  const result = await prisma.$transaction(async (tx) => createIntelligenceQuest(tx, {
    museId: body.museId,
    category: body.category as ProposalCategory,
    question,
    reason,
    expectedValue,
    maxOutputTokens: typeof body.maxOutputTokens === "number" ? body.maxOutputTokens : undefined,
  }));
  return NextResponse.json({ id: result.id, ...result.quest }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Cross-origin intelligence execution is not accepted." }, { status: 403 });
  const body = await request.json();
  const id = text(body.id, 120);
  const action = text(body.action, 40);
  if (!id || action !== "run") return NextResponse.json({ error: "Choose a candidate quest to fuel." }, { status: 400 });

  try {
    const result = await prisma.$transaction(async (tx) => runIntelligenceQuest(tx, id));
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Intelligence quest failed.";
    const locked = message.includes("AI fuel is locked") || message.includes("credential");
    return NextResponse.json({ error: message }, { status: locked ? 503 : 400 });
  }
}
