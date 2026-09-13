import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { hasMuseHandoffSession } from "../../../../lib/muse-handoff-auth";
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
  if (!hasMuseHandoffSession(request)) {
    return NextResponse.json({ error: "muse_handoff_login_required" }, { status: 401 });
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
  const project = await prisma.project.create({
    data: {
      title: internalName || title,
      type: ProjectType.DIGITAL_PRODUCT,
      status: isGated ? ProjectStatus.WAITING : ProjectStatus.PLANNED,
      nextAction: isGated ? "Await performance evidence before advancing" : "Review in Warlock",
      notes: JSON.stringify(payload),
    },
  });

  return NextResponse.json({
    ok: true,
    id: project.id,
    status,
    gated: isGated,
  }, { status: 201 });
}
