import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { emitMuseSignal } from "../../../../lib/museum-signals";
import { observeAureliaProductEntered } from "../../../../lib/museum-agent-observers";
import { ProjectStatus, ProjectType } from "../../../generated/prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SOURCE = "Aurelia";

type HandoffPayload = {
  source?: string;
  internalName?: string;
  status?: string;
  collection?: string;
  title?: string;
  description?: string;
  price?: number;
  launchPrice?: number;
  tags?: string[];
  categorySearch?: string;
};

export async function POST(request: NextRequest) {
  const expected = process.env.MUSE_HANDOFF_SECRET;
  const supplied = request.headers.get("x-muse-handoff-secret");
  if (!expected || supplied !== expected) {
    return NextResponse.json({ error: "unauthorized_handoff" }, { status: 401 });
  }

  const body = (await request.json()) as HandoffPayload;
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const internalName = typeof body.internalName === "string" && body.internalName.trim() ? body.internalName.trim() : title;
  const status = typeof body.status === "string" && body.status.trim() ? body.status.trim() : "handoff_ready";
  const collection = typeof body.collection === "string" ? body.collection.trim() : "";
  const price = Number(body.price);
  const launchPrice = Number(body.launchPrice);
  const tags = Array.isArray(body.tags) ? body.tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 13) : [];
  const categorySearch = typeof body.categorySearch === "string" ? body.categorySearch.trim() : "";

  if (!title) return NextResponse.json({ error: "title_required" }, { status: 400 });

  const payload: HandoffPayload = {
    source: SOURCE,
    internalName,
    status,
    collection,
    title,
    description,
    price: Number.isFinite(price) ? price : undefined,
    launchPrice: Number.isFinite(launchPrice) ? launchPrice : undefined,
    tags,
    categorySearch,
  };

  const isGated = status === "gated_waiting_for_evidence";
  const project = await prisma.$transaction(async (tx) => {
    const created = await tx.project.create({
      data: {
        title: internalName || title,
        type: ProjectType.DIGITAL_PRODUCT,
        status: isGated ? ProjectStatus.WAITING : ProjectStatus.PLANNED,
        nextAction: isGated ? "Await performance evidence before advancing" : "Review in Warlock",
        notes: JSON.stringify(payload),
      },
    });

    await emitMuseSignal(tx, {
      museId: "aurelia",
      title: isGated ? "Product waiting for evidence" : "New product entered Warlock",
      summary: isGated
        ? `${title} entered Warlock but is gated until performance evidence is available.`
        : `${title} entered Warlock and is ready for visual/listing review.`,
      type: isGated ? "waiting" : "update",
      area: collection ? `Spellmark / ${collection}` : "Spellmark / Etsy",
      priority: isGated ? "high" : "normal",
      visualState: isGated ? "waiting" : "working",
      relatedProjectId: created.id,
      sourceKey: `etsy-aurelia-draft:${created.id}`,
    });

    await observeAureliaProductEntered(tx, {
      projectId: created.id,
      title,
      collection,
      status,
    });

    return created;
  });

  return NextResponse.json({
    ok: true,
    id: project.id,
    status,
    gated: isGated,
  }, { status: 201 });
}
