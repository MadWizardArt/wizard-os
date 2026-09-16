import {
  ProjectStatus,
  StageStatus,
  type Prisma,
} from "../app/generated/prisma/client";

type ArtworkProjectDb = Pick<
  Prisma.TransactionClient,
  "project" | "projectStage"
>;

const COMPLETED_AVAILABILITY = new Set(["Available", "Reserved", "Sold"]);

export function artworkIsCreativelyComplete(availability: string) {
  return COMPLETED_AVAILABILITY.has(availability);
}

export async function syncCompletedArtworkProject(
  db: ArtworkProjectDb,
  projectId: string,
  availability: string,
) {
  if (!artworkIsCreativelyComplete(availability)) return;

  const now = new Date();
  await db.project.update({
    where: { id: projectId },
    data: {
      status: ProjectStatus.COMPLETE,
      progress: 100,
      nextAction:
        availability === "Sold"
          ? "Sold Archive — sale and fulfillment tracked from Inventory"
          : "Available Inventory — sales lifecycle managed from Inventory",
    },
  });

  await db.projectStage.updateMany({
    where: {
      projectId,
      name: { in: ["Paint", "Prepare for sale"] },
    },
    data: {
      status: StageStatus.COMPLETE,
      progress: 100,
      completedAt: now,
    },
  });

  // Fulfillment belongs to ArtworkSale, not the generic creative workflow.
  await db.projectStage.updateMany({
    where: { projectId, name: "Fulfill" },
    data: {
      status: StageStatus.SKIPPED,
      progress: 100,
      completedAt: now,
    },
  });
}
