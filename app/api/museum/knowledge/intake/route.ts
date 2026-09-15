import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { MUSE_IDS, type MuseId } from "../../../../../lib/museum";
import type { ProposalCategory } from "../../../../../lib/museum-proposal-storage";
import { recordCouncilKnowledge, type KnowledgeKind } from "../../../../../lib/museum-knowledge";
import {
  knowledgeIngestConfigured,
  verifyArtistSession,
  verifyKnowledgeIngestKey,
} from "../../../../../lib/museum-artist-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS = new Set<KnowledgeKind>(["artist_directive", "decision", "verified_fact", "reference", "working_context"]);
const CATEGORIES = new Set<ProposalCategory>(["revenue", "product", "content", "system", "risk", "research", "capacity", "experiment"]);

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function strings(value: unknown, maxItems: number, maxText: number) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => text(item, maxText)).filter(Boolean).slice(0, maxItems);
}

function bearer(request: NextRequest) {
  const header = request.headers.get("authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

function serviceAuthorized(request: NextRequest) {
  return knowledgeIngestConfigured() && verifyKnowledgeIngestKey(bearer(request));
}

export async function GET(request: NextRequest) {
  const artist = verifyArtistSession(request);
  if (!artist) return NextResponse.json({ error: "Artist session required." }, { status: 401 });
  return NextResponse.json({
    configured: knowledgeIngestConfigured(),
    policy: "External capsules enter the Knowledge Inbox unverified and are excluded from Muse retrieval until Artist approval.",
  });
}

export async function POST(request: NextRequest) {
  const fromArtist = verifyArtistSession(request);
  const fromBridge = serviceAuthorized(request);
  if (!fromArtist && !fromBridge) {
    const status = knowledgeIngestConfigured() ? 401 : 503;
    return NextResponse.json({ error: knowledgeIngestConfigured() ? "Knowledge Intake authorization required." : "Knowledge Intake bridge is not configured." }, { status });
  }

  const body = await request.json().catch(() => ({}));
  const rawCapsules = Array.isArray(body.capsules) ? body.capsules : body.capsule ? [body.capsule] : [body];
  if (rawCapsules.length === 0 || rawCapsules.length > 20) {
    return NextResponse.json({ error: "Send between 1 and 20 knowledge capsules per intake request." }, { status: 400 });
  }

  const accepted: Array<{ id: string; title: string; created: boolean; verifiedByArtist: false }> = [];
  const rejected: Array<{ index: number; error: string }> = [];

  await prisma.$transaction(async (tx) => {
    for (let index = 0; index < rawCapsules.length; index += 1) {
      const capsule = rawCapsules[index] as Record<string, unknown>;
      const title = text(capsule?.title, 180);
      const content = text(capsule?.content, 4000);
      const sourceRef = text(capsule?.sourceRef, 300);
      if (!title || !content || !sourceRef) {
        rejected.push({ index, error: "title, content, and sourceRef are required" });
        continue;
      }

      const kind = KINDS.has(capsule.kind as KnowledgeKind) ? capsule.kind as KnowledgeKind : "working_context";
      const category = capsule.category == null || capsule.category === ""
        ? null
        : CATEGORIES.has(capsule.category as ProposalCategory)
          ? capsule.category as ProposalCategory
          : null;
      const targetMuseIds = strings(capsule.targetMuseIds, 9, 40)
        .filter((id): id is MuseId => (MUSE_IDS as readonly string[]).includes(id));
      const tags = strings(capsule.tags, 14, 60);

      const result = await recordCouncilKnowledge(tx, {
        title,
        content,
        kind,
        source: "nine_muses_project",
        sourceRef,
        category,
        targetMuseIds,
        tags,
        verifiedByArtist: false,
      });
      accepted.push({ id: result.id, title: result.knowledge.title, created: result.created, verifiedByArtist: false });
    }
  });

  return NextResponse.json({
    accepted,
    rejected,
    policy: "Stored in Knowledge Inbox. No capsule becomes active Muse context until the Artist verifies it.",
  }, { status: accepted.length ? 202 : 400 });
}
