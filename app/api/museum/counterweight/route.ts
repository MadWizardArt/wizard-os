import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { isMuseId } from "../../../../lib/museum";
import type { ProposalCategory } from "../../../../lib/museum-proposal-storage";
import {
  completeCounterweightPacket,
  createCounterweightPacket,
  listCounterweightPackets,
  prepareCounterweightQuest,
  prepareCounterweightSynthesis,
} from "../../../../lib/museum-counterweight";
import { verifyArtistSession } from "../../../../lib/museum-artist-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CATEGORIES = new Set<ProposalCategory>([
  "revenue",
  "product",
  "content",
  "system",
  "risk",
  "research",
  "capacity",
  "experiment",
]);

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

export async function GET(request: NextRequest) {
  const denied = requireArtist(request);
  if (denied) return denied;
  return NextResponse.json(await listCounterweightPackets(prisma));
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin counterweight creation is not accepted." }, { status: 403 });
  }
  const denied = requireArtist(request);
  if (denied) return denied;

  const body = await request.json();
  if (!isMuseId(body.primaryMuseId) || !isMuseId(body.counterweightMuseId)) {
    return NextResponse.json({ error: "Choose valid primary and counterweight Muses." }, { status: 400 });
  }
  if (!CATEGORIES.has(body.category as ProposalCategory)) {
    return NextResponse.json({ error: "Choose a valid counterweight category." }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => createCounterweightPacket(tx, {
      primaryMuseId: body.primaryMuseId,
      counterweightMuseId: body.counterweightMuseId,
      category: body.category as ProposalCategory,
      question: text(body.question, 1200),
      primaryPosition: text(body.primaryPosition, 5000),
      trigger: text(body.trigger, 1000),
    }));
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Counterweight packet could not be created.",
    }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin counterweight actions are not accepted." }, { status: 403 });
  }
  const denied = requireArtist(request);
  if (denied) return denied;

  const body = await request.json();
  const id = text(body.id, 120);
  const action = text(body.action, 40);
  if (!id || !["prepare-counterweight", "prepare-synthesis", "complete"].includes(action)) {
    return NextResponse.json({ error: "Choose a counterweight packet action." }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      if (action === "prepare-counterweight") return prepareCounterweightQuest(tx, id);
      if (action === "prepare-synthesis") return prepareCounterweightSynthesis(tx, id);
      return completeCounterweightPacket(tx, id);
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Counterweight packet action failed.";
    const status = /not found/i.test(message) ? 404 : /must complete|prepare and complete|only draft/i.test(message) ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
