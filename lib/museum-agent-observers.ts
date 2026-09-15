import { Prisma, ProjectStatus, ProjectType } from "../app/generated/prisma/client";
import { prisma } from "./prisma";
import { proposeMuseOpportunity } from "./museum-agent-proposals";

type ObserverEventDb = Pick<Prisma.TransactionClient, "project">;

type AureliaProductEvent = {
  projectId: string;
  title: string;
  collection?: string | null;
  status?: string | null;
};

type PaintingAvailableEvent = {
  projectId: string;
  title: string;
};

type ArtworkSaleEvent = {
  projectId: string;
  saleId: string;
  title: string;
  salePriceCents: number;
  costsKnown: boolean;
};

export async function observeAureliaProductEntered(db: ObserverEventDb, event: AureliaProductEvent) {
  const gated = event.status === "gated_waiting_for_evidence";
  if (gated) {
    return proposeMuseOpportunity(db, {
      museId: "cleo",
      title: `Define the evidence gate for ${event.title}`,
      summary: `${event.title} is deliberately waiting for performance evidence. Turn that waiting state into a measurable checkpoint before more production time is committed.`,
      rationale: "A gate only protects time and cash if the council knows what evidence will open it. Cleo should specify the smallest useful signal set, review date, and pass/fail threshold for Brandon to approve.",
      category: "revenue",
      confidence: "high",
      effort: "small",
      expectedValue: "Protect production time while making the next commercial decision measurable.",
      sourceKey: `observer:aurelia-evidence-gate:${event.projectId}:v1`,
      relatedProjectId: event.projectId,
    });
  }

  return proposeMuseOpportunity(db, {
    museId: "lyra",
    title: `Build the launch story for ${event.title}`,
    summary: `${event.title} has entered Warlock. Reuse the product work as a compact promotional package instead of treating the Etsy listing as the final output.`,
    rationale: `The product already contains creative labor that can support multiple audience touchpoints. Lyra should propose the smallest useful content package${event.collection ? ` for the ${event.collection} collection` : ""} and bring it to Brandon before anything is published.`,
    category: "content",
    confidence: "high",
    effort: "small",
    expectedValue: "Increase the return on an existing product asset without requiring a second product build.",
    sourceKey: `observer:aurelia-product-content:${event.projectId}:v1`,
    relatedProjectId: event.projectId,
  });
}

export async function observePaintingAvailable(db: ObserverEventDb, event: PaintingAvailableEvent) {
  return proposeMuseOpportunity(db, {
    museId: "callista",
    title: `Choose a commercial path for ${event.title}`,
    summary: `${event.title} is complete and available. Decide whether it should remain quiet inventory, enter a sales campaign, receive a direct collector push, or support content before the moment passes.`,
    rationale: "Completed paintings are both artistic work and optional economic assets. Callista should compare the lowest-friction commercial paths while preserving Brandon's freedom to keep the work off-market if that is strategically better.",
    category: "revenue",
    confidence: "high",
    effort: "small",
    expectedValue: "Turn completed inventory into an explicit decision instead of passive stock.",
    sourceKey: `observer:painting-available:${event.projectId}:v1`,
    relatedProjectId: event.projectId,
  });
}

export async function observeArtworkSale(db: ObserverEventDb, event: ArtworkSaleEvent) {
  return proposeMuseOpportunity(db, {
    museId: "cleo",
    title: `Close the learning loop on ${event.title}`,
    summary: `${event.title} sold for $${(event.salePriceCents / 100).toFixed(2)}. Record what this sale actually contributed and what should be learned before the next pricing or campaign decision.`,
    rationale: event.costsKnown
      ? "The sale has enough cost context to calculate a useful economic result. Cleo should summarize proceeds, known costs, attribution, and the lesson worth carrying forward."
      : "The sale record is useful, but missing material or framing costs can make revenue look like profit. Cleo should close the cost gap before this sale becomes training data for future decisions.",
    category: "revenue",
    confidence: "high",
    effort: "small",
    expectedValue: event.costsKnown
      ? "Convert one sale into reliable pricing and campaign memory."
      : "Prevent overstated profit and improve the quality of future commercial decisions.",
    sourceKey: `observer:artwork-sale-learning:${event.saleId}:v1`,
    relatedProjectId: event.projectId,
  });
}

type ScanResult = {
  inspected: number;
  created: number;
  existing: number;
  proposalIds: string[];
  rules: Record<string, number>;
};

export async function scanMuseObservers(): Promise<ScanResult> {
  const result: ScanResult = { inspected: 0, created: 0, existing: 0, proposalIds: [], rules: {} };

  const record = (rule: string, output: { id: string; created: boolean }) => {
    result.inspected += 1;
    result.rules[rule] = (result.rules[rule] ?? 0) + (output.created ? 1 : 0);
    if (output.created) {
      result.created += 1;
      result.proposalIds.push(output.id);
    } else {
      result.existing += 1;
    }
  };

  const availablePaintings = await prisma.painting.findMany({
    where: {
      availability: "Available",
      campaigns: { none: {} },
      project: { archivedAt: null },
    },
    include: { project: true },
    orderBy: { project: { updatedAt: "desc" } },
    take: 3,
  });

  for (const painting of availablePaintings) {
    const output = await prisma.$transaction((tx) => observePaintingAvailable(tx, {
      projectId: painting.projectId,
      title: painting.project.title,
    }));
    record("available_painting_without_campaign", output);
  }

  const aureliaProducts = await prisma.project.findMany({
    where: {
      type: ProjectType.DIGITAL_PRODUCT,
      archivedAt: null,
      status: { in: [ProjectStatus.PLANNED, ProjectStatus.WAITING, ProjectStatus.ACTIVE] },
      notes: { contains: `\"source\":\"Aurelia\"` },
    },
    orderBy: { updatedAt: "desc" },
    take: 4,
  });

  for (const project of aureliaProducts) {
    let payload: { title?: string; collection?: string; status?: string } | null = null;
    try {
      payload = project.notes ? JSON.parse(project.notes) : null;
    } catch {
      payload = null;
    }
    if (!payload) continue;
    const output = await prisma.$transaction((tx) => observeAureliaProductEntered(tx, {
      projectId: project.id,
      title: payload?.title || project.title,
      collection: payload?.collection || null,
      status: payload?.status || null,
    }));
    record("aurelia_product_handoff", output);
  }

  const soldWithCostGaps = await prisma.painting.findMany({
    where: {
      availability: "Sold",
      project: { archivedAt: null },
      OR: [{ materialsCostCents: null }, { framingCostCents: null }],
      sales: { some: { status: "Active" } },
    },
    include: {
      project: true,
      sales: { where: { status: "Active" }, orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { project: { updatedAt: "desc" } },
    take: 3,
  });

  for (const painting of soldWithCostGaps) {
    const sale = painting.sales[0];
    if (!sale) continue;
    const output = await prisma.$transaction((tx) => observeArtworkSale(tx, {
      projectId: painting.projectId,
      saleId: sale.id,
      title: painting.project.title,
      salePriceCents: sale.salePriceCents,
      costsKnown: painting.materialsCostCents !== null && painting.framingCostCents !== null,
    }));
    record("sold_artwork_cost_gap", output);
  }

  const today = new Date().toISOString().slice(0, 10);
  const activeCampaigns = await prisma.campaign.findMany({
    where: { status: "Active" },
    include: { tasks: { where: { completed: false }, orderBy: { dueDate: "asc" } } },
    orderBy: { updatedAt: "desc" },
    take: 5,
  });

  for (const campaign of activeCampaigns) {
    const overdue = campaign.tasks.filter((task) => task.dueDate < today);
    if (!overdue.length) continue;
    const output = await prisma.$transaction((tx) => proposeMuseOpportunity(tx, {
      museId: "tessa",
      title: `Recover the schedule for ${campaign.title}`,
      summary: `${campaign.title} has ${overdue.length} unfinished task${overdue.length === 1 ? "" : "s"} past due. Bring Brandon a small recovery plan rather than silently carrying schedule debt.`,
      rationale: "A commercially useful plan must fit actual capacity. Tessa should distinguish tasks that still matter from tasks that can be dropped, then propose the smallest schedule repair that protects the campaign and painting time.",
      category: "capacity",
      confidence: "high",
      effort: "small",
      expectedValue: "Reduce hidden workload and preserve completion capacity for work that can earn or matter.",
      sourceKey: `observer:campaign-overdue:${campaign.id}:v1`,
      relatedProjectId: campaign.projectId,
    }));
    record("active_campaign_overdue_tasks", output);
  }

  return result;
}
