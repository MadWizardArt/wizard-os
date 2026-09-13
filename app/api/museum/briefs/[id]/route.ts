import { NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { decodeMuseumBrief, MUSEUM_BRIEF_PREFIX } from "../../../../../lib/museum-brief-storage";
import { ProjectType } from "../../../../generated/prisma/client";

export const runtime = "nodejs";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!id) return NextResponse.json({ error: "Brief id is required." }, { status: 400 });

  const existing = await prisma.project.findFirst({
    where: {
      id,
      type: ProjectType.INTERNAL,
      archivedAt: null,
      notes: { startsWith: MUSEUM_BRIEF_PREFIX },
    },
    select: { id: true, notes: true },
  });

  if (!existing) return NextResponse.json({ error: "Brief not found." }, { status: 404 });
  const brief = decodeMuseumBrief(existing.notes);
  if (!brief) return NextResponse.json({ error: "Brief record is invalid." }, { status: 409 });

  await prisma.project.delete({ where: { id: existing.id } });

  return NextResponse.json({
    deleted: true,
    id: existing.id,
    title: brief.title,
    linkedProjectId: brief.linkedProjectId,
  });
}
