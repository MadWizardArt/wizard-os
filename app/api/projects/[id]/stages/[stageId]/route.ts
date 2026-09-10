import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../../lib/prisma";
import { StageStatus } from "../../../../../generated/prisma/client";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string; stageId: string }> };

export async function PATCH(request: NextRequest, context: Context) {
  const { id, stageId } = await context.params;
  const body = await request.json();
  if (!Object.values(StageStatus).includes(body.status)) return NextResponse.json({ error: "Invalid stage status." }, { status: 400 });
  const progress = body.status === StageStatus.COMPLETE ? 100 : body.status === StageStatus.NOT_STARTED ? 0 : Math.max(0, Math.min(99, Number(body.progress) || 0));

  const stage = await prisma.projectStage.findFirst({ where: { id: stageId, projectId: id } });
  if (!stage) return NextResponse.json({ error: "Stage not found." }, { status: 404 });
  const updated = await prisma.projectStage.update({
    where: { id: stageId },
    data: { status: body.status, progress, completedAt: body.status === StageStatus.COMPLETE ? new Date() : null },
  });

  const stages = await prisma.projectStage.findMany({ where: { projectId: id }, orderBy: { position: "asc" } });
  const projectProgress = Math.round(stages.reduce((sum, item) => sum + item.progress, 0) / Math.max(stages.length, 1));
  const nextStage = stages.find((item) => item.status !== StageStatus.COMPLETE && item.status !== StageStatus.SKIPPED);
  await prisma.project.update({ where: { id }, data: { progress: projectProgress, nextAction: nextStage?.name ?? "Workflow complete", status: projectProgress === 100 ? "COMPLETE" : "ACTIVE" } });

  return NextResponse.json(updated);
}
