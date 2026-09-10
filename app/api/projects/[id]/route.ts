import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { ProjectStatus } from "../../../generated/prisma/client";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: Context) {
  const { id } = await context.params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: { stages: { orderBy: { position: "asc" } }, template: { select: { name: true } } },
  });
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  return NextResponse.json(project);
}

export async function PATCH(request: NextRequest, context: Context) {
  const { id } = await context.params;
  const body = await request.json();
  const data: Record<string, unknown> = {};
  if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim();
  if (Object.values(ProjectStatus).includes(body.status)) data.status = body.status;
  if (Number.isInteger(body.progress) && body.progress >= 0 && body.progress <= 100) data.progress = body.progress;
  if (typeof body.nextAction === "string") data.nextAction = body.nextAction.trim() || null;
  if (typeof body.notes === "string") data.notes = body.notes;
  if (body.value === "" || body.value == null) data.valueCents = null;
  else if (!Number.isNaN(Number(body.value))) data.valueCents = Math.round(Number(body.value) * 100);
  if (body.dueDate === "" || body.dueDate == null) data.dueDate = null;
  else if (typeof body.dueDate === "string") data.dueDate = new Date(`${body.dueDate}T12:00:00`);

  try {
    return NextResponse.json(await prisma.project.update({ where: { id }, data }));
  } catch {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }
}

export async function DELETE(_request: NextRequest, context: Context) {
  const { id } = await context.params;
  try {
    const project = await prisma.project.update({ where: { id }, data: { status: ProjectStatus.ARCHIVED, archivedAt: new Date() } });
    return NextResponse.json(project);
  } catch {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }
}
