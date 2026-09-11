import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../../lib/prisma";
import { StageStatus } from "../../../../../generated/prisma/client";

import { summarize, validFields } from "../../../../../../lib/workflow";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string; stageId: string }> };

export async function PATCH(request: NextRequest, context: Context) {
  const { id, stageId } = await context.params;
  const body = await request.json();
  if (!Object.values(StageStatus).includes(body.status)) return NextResponse.json({ error: "Invalid stage status." }, { status: 400 });
  if (body.fields !== undefined && !validFields(body.fields)) return NextResponse.json({error: "Invalid stage fields."}, {status: 400});
  if (!Number.isFinite(body.progress) || body.progress < 0 || body.progress > 100) return NextResponse.json({error: "Invalid progress."}, {status: 400});
  const progress = body.status === 'COMPLETE' ? 100 : body.status === 'NOT_STARTED' || body.status === 'SKIPPED' ? 0 : Math.min(99, Math.round(body.progress));
  try {
    const updated = await prisma.$transaction(async tx => {
      const project = await tx.project.findUnique({where: {id}});
      if (!project || project.archivedAt) throw new Error('Project unavailable.');
      const stage = await tx.projectStage.findFirst({where: {id: stageId, projectId: id}});
      if (!stage) throw new Error('Stage not found.');
      if (body.updatedAt && stage.updatedAt.toISOString() !== body.updatedAt) throw new Error('This stage changed. Reopen it to load the latest version.');
      const updated = await tx.projectStage.update({where: {id: stageId}, data: {
        status: body.status, progress,
        ...(body.fields !== undefined ? {fieldsJson: JSON.stringify(body.fields)} : {}),
        completedAt: body.status === 'COMPLETE' ? stage.completedAt ?? new Date() : null,
      }});
      const stages = await tx.projectStage.findMany({where: {projectId: id}, orderBy: {position: 'asc'}});
      const summary = summarize(stages);
      await tx.project.update({where: {id}, data: {...summary, status: summary.status as 'ACTIVE' | 'PLANNED' | 'COMPLETE' | 'WAITING'}});
      return updated;
    }, {isolationLevel: 'Serializable'});
    return NextResponse.json(updated);
  } catch (e) {return NextResponse.json({error: e instanceof Error && !('code' in e) ? e.message : 'Save conflicted. Reopen this stage and try again.'}, {status: 409});}
}
