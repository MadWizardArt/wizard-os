import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { ProjectStatus, ProjectType } from "../../generated/prisma/client";

export const runtime = "nodejs";

const kindByType = {
  ARTWORK: "Artwork",
  COMMISSION: "Commission",
  DIGITAL_PRODUCT: "Project",
  CONTENT: "Project",
  INTERNAL: "Project",
} as const;

const toneByType = {
  ARTWORK: "burgundy",
  COMMISSION: "navy",
  DIGITAL_PRODUCT: "green",
  CONTENT: "green",
  INTERNAL: "navy",
} as const;

export async function GET() {
  const projects = await prisma.project.findMany({
    where: { archivedAt: null },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
  });

  return NextResponse.json(
    projects.map((project) => ({
      id: project.id,
      title: project.title,
      type: project.type,
      statusEnum: project.status,
      templateId: project.templateId,
      kind: kindByType[project.type],
      status: project.status.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
      progress: project.progress,
      next: project.nextAction ?? "Choose next action",
      value: project.valueCents == null ? (project.type === "ARTWORK" ? "Original" : "Internal") : `$${(project.valueCents / 100).toLocaleString()}`,
      due: project.dueDate ? project.dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "No deadline",
      tone: toneByType[project.type],
    })),
  );
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return NextResponse.json({ error: "Title is required." }, { status: 400 });
  if (!Object.values(ProjectType).includes(body.type)) return NextResponse.json({ error: "Choose a valid project type." }, { status: 400 });

  const template = body.templateId
    ? await prisma.workflowTemplate.findUnique({ where: { id: body.templateId }, include: { stages: { orderBy: { position: "asc" } } } })
    : null;
  if (!template) return NextResponse.json({ error: "Choose a workflow template." }, { status: 400 });

  const project = await prisma.project.create({
    data: {
      title,
      type: body.type,
      status: ProjectStatus.PLANNED,
      valueCents: body.value ? Math.round(Number(body.value) * 100) : null,
      dueDate: body.dueDate ? new Date(`${body.dueDate}T12:00:00`) : null,
      nextAction: typeof body.nextAction === "string" && body.nextAction.trim() ? body.nextAction.trim() : template.stages[0]?.name ?? "Choose next action",
      templateId: template.id,
      stages: {
        create: template.stages.map((stage) => ({
          name: stage.name,
          position: stage.position,
          fieldsJson: stage.defaultFieldsJson,
        })),
      },
    },
  });

  return NextResponse.json(project, { status: 201 });
}
