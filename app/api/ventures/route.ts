import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { VentureStatus } from "../../generated/prisma/client";
import { opportunityScore } from "../../../lib/opportunity-score";

export const runtime = "nodejs";

export async function GET() {
  const ventures = await prisma.venture.findMany({ where: { archivedAt: null }, orderBy: { updatedAt: "desc" } });
  return NextResponse.json(ventures.map((venture) => ({ ...venture, score: opportunityScore(venture) })).sort((a, b) => b.score - a.score));
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  if (!body.name?.trim()) return NextResponse.json({ error: "Venture name is required." }, { status: 400 });
  const scores = ["demand", "margin", "recurrence", "automation", "defensibility", "startupCost", "weeklyHours"] as const;
  if (scores.some((key) => !Number.isInteger(Number(body[key])) || Number(body[key]) < 1 || Number(body[key]) > 5)) return NextResponse.json({ error: "Every score must be between 1 and 5." }, { status: 400 });
  const venture = await prisma.venture.create({ data: {
    name: body.name.trim(), description: body.description?.trim() || null,
    status: Object.values(VentureStatus).includes(body.status) ? body.status : VentureStatus.IDEA,
    demand: Number(body.demand), margin: Number(body.margin), recurrence: Number(body.recurrence), automation: Number(body.automation), defensibility: Number(body.defensibility), startupCost: Number(body.startupCost), weeklyHours: Number(body.weeklyHours), nextAction: body.nextAction?.trim() || null,
  }});
  return NextResponse.json({ ...venture, score: opportunityScore(venture) }, { status: 201 });
}
