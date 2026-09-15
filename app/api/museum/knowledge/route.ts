import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { MUSE_IDS, type MuseId } from "../../../../lib/museum";
import type { ProposalCategory } from "../../../../lib/museum-proposal-storage";
import {
  listCouncilKnowledge,
  recordCouncilKnowledge,
  type KnowledgeKind,
  type KnowledgeSource,
} from "../../../../lib/museum-knowledge";
import { ensureCanonicalNineMusesKnowledge } from "../../../../lib/museum-knowledge-seed";
import { verifyArtistSession } from "../../../../lib/museum-artist-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS = new Set<KnowledgeKind>(["artist_directive", "decision", "verified_fact", "reference", "working_context"]);
const SOURCES = new Set<KnowledgeSource>(["nine_muses_project", "wizard_os", "artist", "import"]);
const CATEGORIES = new Set<ProposalCategory>(["revenue", "product", "content", "system", "risk", "research", "capacity", "experiment"]);

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function stringList(value: unknown, maxItems: number, maxText: number) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => text(item, maxText)).filter(Boolean).slice(0, maxItems);
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
  await prisma.$transaction(async (tx) => ensureCanonicalNineMusesKnowledge(tx));
  const entries = await listCouncilKnowledge(prisma);
  return NextResponse.json(entries);
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Cross-origin knowledge writes are not accepted." }, { status: 403 });
  const denied = requireArtist(request);
  if (denied) return denied;

  const body = await request.json();
  const title = text(body.title, 180);
  const content = text(body.content, 4000);
  const sourceRef = text(body.sourceRef, 300);
  const kind = KINDS.has(body.kind as KnowledgeKind) ? body.kind as KnowledgeKind : "working_context";
  const source = SOURCES.has(body.source as KnowledgeSource) ? body.source as KnowledgeSource : "import";
  const category = body.category == null || body.category === ""
    ? null
    : CATEGORIES.has(body.category as ProposalCategory)
      ? body.category as ProposalCategory
      : null;
  const targetMuseIds = stringList(body.targetMuseIds, 9, 40).filter((id): id is MuseId => (MUSE_IDS as readonly string[]).includes(id));
  const tags = stringList(body.tags, 14, 60);

  if (!title || !content || !sourceRef) {
    return NextResponse.json({ error: "Title, knowledge, and source reference are required." }, { status: 400 });
  }

  const result = await prisma.$transaction(async (tx) => recordCouncilKnowledge(tx, {
    title,
    content,
    kind,
    source,
    sourceRef,
    category,
    targetMuseIds,
    tags,
    verifiedByArtist: Boolean(body.verifiedByArtist),
  }));

  return NextResponse.json({ id: result.id, ...result.knowledge }, { status: result.created ? 201 : 200 });
}
