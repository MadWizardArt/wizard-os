import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const templates = await prisma.workflowTemplate.findMany({
    where: { isDefault: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, projectType: true },
  });
  return NextResponse.json(templates);
}
