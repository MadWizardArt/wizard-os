import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";

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
