import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { isMuseId } from "../../../../lib/museum";
import { getMuseMindKernel } from "../../../../lib/museum-mind-kernel";
import type { MuseMemoryKind } from "../../../../lib/museum-memory-storage";
import type { ProposalCategory } from "../../../../lib/museum-proposal-storage";
import {
  graduateMuseWorkingState,
  readMuseMindContinuity,
  upsertMuseWorkingState,
  verifyMuseWorkingState,
} from "../../../../lib/museum-mind-continuity";
import type { MuseWorkingStateStatus } from "../../../../lib/museum-working-state-storage";
import { verifyArtistSession } from "../../../../lib/museum-artist-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CATEGORIES = new Set<ProposalCategory>(["revenue", "product", "content", "system", "risk", "research", "capacity", "experiment"]);
const STATUSES = new Set<MuseWorkingStateStatus>(["active", "waiting", "blocked", "complete", "superseded"]);
const MEMORY_KINDS = new Set<MuseMemoryKind>(["decision", "outcome", "lesson"]);

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function optionalNullableText(value: unknown, max: number) {
  if (value === undefined) return undefined;
  return text(value, max) || null;
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

function refs(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().slice(0, 300))
    .filter(Boolean)
    .slice(0, 12);
}

export async function GET(request: NextRequest) {
  const denied = requireArtist(request);
  if (denied) return denied;

  const museParam = request.nextUrl.searchParams.get("muse");
  if (!museParam || !isMuseId(museParam)) {
    return NextResponse.json({ error: "Choose a valid Muse." }, { status: 400 });
  }

  const continuity = await readMuseMindContinuity(prisma, museParam);
  const mindKernel = getMuseMindKernel(museParam);
  return NextResponse.json({
    ...continuity,
    relationship: mindKernel?.relationships.artist ?? null,
  });
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Cross-origin mind-state writes are not accepted." }, { status: 403 });
  const denied = requireArtist(request);
  if (denied) return denied;

  const body = await request.json();
  if (!isMuseId(body.museId)) return NextResponse.json({ error: "Choose a valid Muse." }, { status: 400 });
  if (!CATEGORIES.has(body.category as ProposalCategory)) return NextResponse.json({ error: "Choose a valid working-state category." }, { status: 400 });

  const objective = text(body.objective, 240);
  const sourceKey = text(body.sourceKey, 260);
  const completionCondition = text(body.completionCondition, 700);
  let status: MuseWorkingStateStatus | undefined;
  if (body.status !== undefined) {
    if (!STATUSES.has(body.status as MuseWorkingStateStatus)) {
      return NextResponse.json({ error: "Choose a valid working-state status." }, { status: 400 });
    }
    status = body.status as MuseWorkingStateStatus;
  }
  if (!objective || !sourceKey || !completionCondition) {
    return NextResponse.json({ error: "Objective, sourceKey, and completionCondition are required." }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => upsertMuseWorkingState(tx, {
      museId: body.museId,
      objective,
      category: body.category as ProposalCategory,
      sourceKey,
      sourceProjectId: optionalNullableText(body.sourceProjectId, 120),
      status,
      nextAction: optionalNullableText(body.nextAction, 700),
      completionCondition,
      notes: optionalNullableText(body.notes, 1400),
      evidenceRefs: body.evidenceRefs === undefined ? undefined : refs(body.evidenceRefs),
    }));
    return NextResponse.json({ id: result.id, ...result.state }, { status: result.created ? 201 : 200 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Working state could not be saved." }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Cross-origin mind-state actions are not accepted." }, { status: 403 });
  const denied = requireArtist(request);
  if (denied) return denied;

  const body = await request.json();
  const id = text(body.id, 120);
  const action = text(body.action, 40);
  if (!id || !["verify", "graduate"].includes(action)) {
    return NextResponse.json({ error: "Choose a working-state action." }, { status: 400 });
  }

  try {
    if (action === "verify") {
      const evidenceRefs = refs(body.evidenceRefs);
      const result = await prisma.$transaction(async (tx) => verifyMuseWorkingState(tx, id, "artist-confirmed", evidenceRefs));
      return NextResponse.json({ id: result.id, ...result.state });
    }

    const summary = text(body.summary, 1200);
    if (!summary) return NextResponse.json({ error: "Graduation requires an explicit durable lesson summary." }, { status: 400 });
    const kind = MEMORY_KINDS.has(body.kind as MuseMemoryKind) ? body.kind as MuseMemoryKind : "lesson";
    const result = await prisma.$transaction(async (tx) => graduateMuseWorkingState(tx, id, {
      kind,
      title: text(body.title, 180) || null,
      summary,
    }));
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mind-state action failed.";
    const status = /not found/i.test(message) ? 404 : /already graduated|must be complete|must be explicitly verified|requires at least one evidence/i.test(message) ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
