import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { isMuseId } from "../../../../lib/museum";
import type { ProposalCategory } from "../../../../lib/museum-proposal-storage";
import {
  createIntelligenceQuest,
  describeIntelligenceFailure,
  listIntelligenceQuests,
  readIntelligenceFuelUsage,
  retryIntelligenceQuest,
  runIntelligenceQuest,
} from "../../../../lib/museum-intelligence";
import { ensureCanonicalNineMusesKnowledge } from "../../../../lib/museum-knowledge-seed";
import { intelligenceFuelEnabled, verifyArtistSession } from "../../../../lib/museum-artist-auth";
import { resolveAiGatewayAuthToken } from "../../../../lib/vercel-oidc";

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

function requireArtist(request: NextRequest) {
  return verifyArtistSession(request)
    ? null
    : NextResponse.json({ error: "Artist session required." }, { status: 401 });
}

type GatewayStatus = {
  state: "ready" | "empty" | "unavailable" | "unknown";
  balance: number | null;
  totalUsed: number | null;
  modelListed: boolean | null;
  checkedAt: string;
};

async function readGatewayStatus(auth: string, model: string): Promise<GatewayStatus> {
  const checkedAt = new Date().toISOString();
  if (!auth) return { state: "unavailable", balance: null, totalUsed: null, modelListed: null, checkedAt };

  try {
    const [creditResponse, modelResponse] = await Promise.all([
      fetch("https://ai-gateway.vercel.sh/v1/credits", {
        headers: { Authorization: `Bearer ${auth}` },
        cache: "no-store",
      }),
      fetch("https://ai-gateway.vercel.sh/v1/models", {
        headers: { Authorization: `Bearer ${auth}` },
        cache: "no-store",
      }),
    ]);

    const creditPayload = await creditResponse.json().catch(() => ({}));
    const modelPayload = await modelResponse.json().catch(() => ({}));
    const parsedBalance = Number(creditPayload?.balance);
    const parsedUsed = Number(creditPayload?.total_used);
    const balance = Number.isFinite(parsedBalance) ? parsedBalance : null;
    const totalUsed = Number.isFinite(parsedUsed) ? parsedUsed : null;
    const models = Array.isArray(modelPayload?.data) ? modelPayload.data : null;
    const modelListed = models ? models.some((entry: { id?: unknown }) => entry?.id === model) : null;

    if (!creditResponse.ok) return { state: "unknown", balance, totalUsed, modelListed, checkedAt };
    if (balance !== null && balance <= 0) return { state: "empty", balance, totalUsed, modelListed, checkedAt };
    return { state: "ready", balance, totalUsed, modelListed, checkedAt };
  } catch {
    return { state: "unknown", balance: null, totalUsed: null, modelListed: null, checkedAt };
  }
}

export async function GET(request: NextRequest) {
  const denied = requireArtist(request);
  if (denied) return denied;
  await prisma.$transaction(async (tx) => ensureCanonicalNineMusesKnowledge(tx));

  const model = process.env.MUSE_INTELLIGENCE_MODEL || "openai/gpt-5.6-sol";
  const gatewayAuth = await resolveAiGatewayAuthToken();
  const [quests, usage, gateway] = await Promise.all([
    listIntelligenceQuests(prisma),
    readIntelligenceFuelUsage(prisma),
    readGatewayStatus(gatewayAuth, model),
  ]);

  return NextResponse.json({
    enabled: intelligenceFuelEnabled(),
    model,
    gateway,
    usage,
    quests,
  });
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Cross-origin quest creation is not accepted." }, { status: 403 });
  const denied = requireArtist(request);
  if (denied) return denied;

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
  if (!sameOrigin(request)) return NextResponse.json({ error: "Cross-origin intelligence actions are not accepted." }, { status: 403 });
  const denied = requireArtist(request);
  if (denied) return denied;

  const body = await request.json();
  const id = text(body.id, 120);
  const action = text(body.action, 40);
  if (!id || !["run", "retry"].includes(action)) {
    return NextResponse.json({ error: "Choose a quest action." }, { status: 400 });
  }

  try {
    if (action === "retry") {
      const result = await prisma.$transaction(async (tx) => retryIntelligenceQuest(tx, id));
      return NextResponse.json({ id: result.id, ...result.quest }, { status: 201 });
    }

    const gatewayAuth = await resolveAiGatewayAuthToken();
    const result = await runIntelligenceQuest(prisma, id, gatewayAuth);
    return NextResponse.json(result);
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : "Intelligence quest failed.";
    const failure = describeIntelligenceFailure(rawMessage);
    const status = failure.code === "budget" ? 429 : failure.code === "gateway_auth" ? 503 : 400;
    return NextResponse.json({ error: failure.message, code: failure.code, retryable: failure.retryable }, { status });
  }
}
