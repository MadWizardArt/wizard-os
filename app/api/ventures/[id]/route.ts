import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { VentureStatus } from "../../../generated/prisma/client";
import { opportunityScore } from "../../../../lib/opportunity-score";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: Context) {
  const { id } = await context.params;
  const body = await request.json();
  const scores = ["demand", "margin", "recurrence", "automation", "defensibility", "startupCost", "weeklyHours"] as const;
  if (!body.name?.trim() || scores.some((key) => Number(body[key]) < 1 || Number(body[key]) > 5)) return NextResponse.json({ error: "Name and scores from 1–5 are required." }, { status: 400 });
  try {
    const venture = await prisma.venture.update({ where: { id }, data: { name: body.name.trim(), description: body.description?.trim() || null, status: Object.values(VentureStatus).includes(body.status) ? body.status : VentureStatus.IDEA, demand: Number(body.demand), margin: Number(body.margin), recurrence: Number(body.recurrence), automation: Number(body.automation), defensibility: Number(body.defensibility), startupCost: Number(body.startupCost), weeklyHours: Number(body.weeklyHours), nextAction: body.nextAction?.trim() || null } });
    return NextResponse.json({ ...venture, score: opportunityScore(venture) });
  } catch { return NextResponse.json({ error: "Venture not found." }, { status: 404 }); }
}

export async function DELETE(_request: NextRequest, context: Context) {
  const { id } = await context.params;
  try { return NextResponse.json(await prisma.venture.update({ where: { id }, data: { status: VentureStatus.ARCHIVED, archivedAt: new Date() } })); }
  catch { return NextResponse.json({ error: "Venture not found." }, { status: 404 }); }
}
