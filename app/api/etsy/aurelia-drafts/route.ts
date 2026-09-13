import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { ProjectStatus, ProjectType } from "../../../generated/prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SOURCE = "Aurelia";

type HandoffPayload = {
  source?: string;
  title?: string;
  description?: string;
  price?: number;
  tags?: string[];
  categorySearch?: string;
};

function parseNotes(notes: string | null) {
  if (!notes) return null;
  try {
    return JSON.parse(notes) as HandoffPayload;
  } catch {
    return null;
  }
}

export async function GET() {
  const projects = await prisma.project.findMany({
    where: {
      type: ProjectType.DIGITAL_PRODUCT,
      archivedAt: null,
      notes: { contains: `\"source\":\"${SOURCE}\"` },
    },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  const drafts = projects
    .map((project) => {
      const payload = parseNotes(project.notes);
      if (!payload || payload.source !== SOURCE) return null;
      return {
        id: project.id,
        title: payload.title || project.title,
        description: payload.description || "",
        price: Number.isFinite(payload.price) ? payload.price : null,
        tags: Array.isArray(payload.tags) ? payload.tags : [],
        categorySearch: payload.categorySearch || "",
        createdAt: project.createdAt,
      };
    })
    .filter(Boolean);

  return NextResponse.json({ drafts });
}

export async function POST(request: NextRequest) {
  const expected = process.env.MUSE_HANDOFF_SECRET;
  const supplied = request.headers.get("x-muse-handoff-secret");
  if (!expected || supplied !== expected) {
    return NextResponse.json({ error: "unauthorized_handoff" }, { status: 401 });
  }

  const body = (await request.json()) as HandoffPayload;
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const price = Number(body.price);
  const tags = Array.isArray(body.tags) ? body.tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 13) : [];
  const categorySearch = typeof body.categorySearch === "string" ? body.categorySearch.trim() : "";

  if (!title) return NextResponse.json({ error: "title_required" }, { status: 400 });

  const payload: HandoffPayload = {
    source: SOURCE,
    title,
    description,
    price: Number.isFinite(price) ? price : undefined,
    tags,
    categorySearch,
  };

  const project = await prisma.project.create({
    data: {
      title,
      type: ProjectType.DIGITAL_PRODUCT,
      status: ProjectStatus.PLANNED,
      nextAction: "Review in Warlock",
      notes: JSON.stringify(payload),
    },
  });

  return NextResponse.json({ ok: true, id: project.id }, { status: 201 });
}
