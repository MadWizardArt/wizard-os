import { Prisma, ProjectStatus, ProjectType, VentureStatus } from "../app/generated/prisma/client";
import type { MuseId } from "./museum";
import type { ProposalCategory } from "./museum-proposal-storage";
import { activeCampaignStatuses } from "./campaign-rules";
import { isMuseumInfrastructureNotes } from "./museum-project-hygiene";

export type IntelligenceContextPacket = {
  generatedAt: string;
  museId: MuseId;
  category: ProposalCategory;
  lines: string[];
  refs: string[];
  text: string;
};

type ContextDb = Pick<Prisma.TransactionClient, "project" | "painting" | "artworkSale" | "campaign" | "venture">;

function money(cents: number | null | undefined) {
  return typeof cents === "number" && Number.isFinite(cents) ? `$${(cents / 100).toFixed(2)}` : "unknown";
}

function isoDay(value: Date | string | null | undefined) {
  if (!value) return "none";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "unknown" : date.toISOString().slice(0, 10);
}

function safeJson(notes: string | null) {
  if (!notes?.trim().startsWith("{")) return null;
  try {
    const parsed = JSON.parse(notes) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function textField(value: unknown, max = 90) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

function finalize(museId: MuseId, category: ProposalCategory, lines: string[], refs: string[]) {
  const bounded: string[] = [];
  let chars = 0;
  for (const line of lines.filter(Boolean).slice(0, 18)) {
    const clean = line.replace(/\s+/g, " ").trim().slice(0, 420);
    if (!clean) continue;
    if (chars + clean.length > 3400) break;
    bounded.push(clean);
    chars += clean.length;
  }
  const uniqueRefs = [...new Set(refs)].slice(0, 24);
  return {
    generatedAt: new Date().toISOString(),
    museId,
    category,
    lines: bounded,
    refs: uniqueRefs,
    text: bounded.length ? bounded.map((line, index) => `${index + 1}. ${line}`).join("\n") : "No useful live Wizard OS state was found for this category.",
  } satisfies IntelligenceContextPacket;
}

async function productContext(db: ContextDb, museId: MuseId, category: ProposalCategory) {
  const products = await db.project.findMany({
    where: { type: ProjectType.DIGITAL_PRODUCT, archivedAt: null },
    select: { id: true, title: true, status: true, nextAction: true, valueCents: true, notes: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
    take: 8,
  });
  const lines = [`Recent digital products in Wizard OS: ${products.length} shown.`];
  const refs: string[] = [];
  for (const project of products) {
    const payload = safeJson(project.notes);
    const source = textField(payload?.source, 30);
    const listingStatus = textField(payload?.status, 50);
    const collection = textField(payload?.collection, 60);
    const payloadTitle = textField(payload?.title, 110);
    const price = typeof payload?.price === "number" ? `$${payload.price.toFixed(2)}` : money(project.valueCents);
    lines.push(`${payloadTitle || project.title} · project ${project.status}${listingStatus ? ` · Warlock ${listingStatus}` : ""}${collection ? ` · collection ${collection}` : ""} · price ${price}${source ? ` · source ${source}` : ""}${project.nextAction ? ` · next: ${textField(project.nextAction, 100)}` : ""}`);
    refs.push(`project:${project.id}`);
  }
  return finalize(museId, category, lines, refs);
}

async function revenueContext(db: ContextDb, museId: MuseId, category: ProposalCategory) {
  const [availableCount, available, sales, campaigns] = await Promise.all([
    db.painting.count({ where: { availability: "Available", project: { archivedAt: null } } }),
    db.painting.findMany({
      where: { availability: "Available", project: { archivedAt: null } },
      include: { project: true },
      orderBy: { project: { updatedAt: "desc" } },
      take: 5,
    }),
    db.artworkSale.findMany({
      where: { status: "Active" },
      include: { painting: { include: { project: true } } },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    db.campaign.findMany({
      where: { status: { in: activeCampaignStatuses } },
      select: { id: true, title: true, status: true, targetCents: true, startDate: true, endDate: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 4,
    }),
  ]);
  const lines = [`Available painting inventory: ${availableCount}. Recent sample: ${available.length}. Recent active sales shown: ${sales.length}. Active campaigns: ${campaigns.length}.`];
  const refs: string[] = [];
  for (const painting of available) {
    lines.push(`Available painting: ${painting.project.title} · ask ${money(painting.regularPriceCents)} · ${painting.dimensions || "dimensions unknown"} · ${painting.medium || "medium unknown"}`);
    refs.push(`painting:${painting.projectId}`);
  }
  for (const sale of sales) {
    const costsComplete = sale.painting.materialsCostCents !== null && sale.painting.framingCostCents !== null && sale.sellingFeesCents !== null && sale.shippingExpenseCents !== null;
    lines.push(`Recent sale: ${sale.painting.project.title} · sold ${money(sale.salePriceCents)} on ${sale.saleDate} · cost record ${costsComplete ? "complete" : "incomplete"}`);
    refs.push(`sale:${sale.id}`, `painting:${sale.projectId}`);
  }
  for (const campaign of campaigns) {
    lines.push(`${campaign.status} campaign: ${campaign.title} · target ${money(campaign.targetCents)} · ${campaign.startDate} → ${campaign.endDate}`);
    refs.push(`campaign:${campaign.id}`);
  }
  return finalize(museId, category, lines, refs);
}

async function contentContext(db: ContextDb, museId: MuseId, category: ProposalCategory) {
  const [projects, campaigns] = await Promise.all([
    db.project.findMany({
      where: { type: ProjectType.CONTENT, archivedAt: null, status: { in: [ProjectStatus.PLANNED, ProjectStatus.ACTIVE, ProjectStatus.WAITING] } },
      select: { id: true, title: true, status: true, dueDate: true, nextAction: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 8,
    }),
    db.campaign.findMany({
      where: { status: { in: ["Draft", ...activeCampaignStatuses] } },
      include: { content: { orderBy: { postingDate: "asc" }, take: 5 } },
      orderBy: { updatedAt: "desc" },
      take: 4,
    }),
  ]);
  const lines = [`Current content projects: ${projects.length} shown. Campaigns with content plans: ${campaigns.length} shown.`];
  const refs: string[] = [];
  for (const project of projects) {
    lines.push(`Content project: ${project.title} · ${project.status} · due ${isoDay(project.dueDate)}${project.nextAction ? ` · next: ${textField(project.nextAction, 110)}` : ""}`);
    refs.push(`project:${project.id}`);
  }
  for (const campaign of campaigns) {
    if (!campaign.content.length) continue;
    const items = campaign.content.map((item) => `${item.title} (${item.postingDate}, ${item.status})`).join("; ").slice(0, 320);
    lines.push(`Campaign content · ${campaign.title}: ${items}`);
    refs.push(`campaign:${campaign.id}`, ...campaign.content.map((item) => `campaign-content:${item.id}`));
  }
  return finalize(museId, category, lines, refs);
}

async function capacityContext(db: ContextDb, museId: MuseId, category: ProposalCategory) {
  const [projectCandidates, campaigns] = await Promise.all([
    db.project.findMany({
      where: { archivedAt: null, status: { in: [ProjectStatus.ACTIVE, ProjectStatus.WAITING, ProjectStatus.BLOCKED] } },
      select: { id: true, title: true, type: true, status: true, dueDate: true, nextAction: true, notes: true, updatedAt: true },
      orderBy: [{ dueDate: "asc" }, { updatedAt: "desc" }],
      take: 30,
    }),
    db.campaign.findMany({
      where: { status: { in: activeCampaignStatuses } },
      include: { tasks: { where: { completed: false }, orderBy: { dueDate: "asc" } } },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
  ]);
  const projects = projectCandidates.filter((project) => !isMuseumInfrastructureNotes(project.notes)).slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const lines = [`Active/waiting/blocked operational workload: ${projects.length} priority records shown. Museum infrastructure is excluded.`];
  const refs: string[] = [];
  for (const project of projects) {
    lines.push(`${project.type} · ${project.title} · ${project.status} · due ${isoDay(project.dueDate)}${project.nextAction ? ` · next: ${textField(project.nextAction, 100)}` : ""}`);
    refs.push(`project:${project.id}`);
  }
  for (const campaign of campaigns) {
    const overdue = campaign.tasks.filter((task) => task.dueDate < today).length;
    if (!overdue) continue;
    lines.push(`Schedule pressure: ${campaign.title} has ${overdue} overdue unfinished task${overdue === 1 ? "" : "s"}.`);
    refs.push(`campaign:${campaign.id}`);
  }
  return finalize(museId, category, lines, refs);
}

async function riskContext(db: ContextDb, museId: MuseId, category: ProposalCategory) {
  const [blockedCandidates, costGapCount, campaigns] = await Promise.all([
    db.project.findMany({
      where: { archivedAt: null, status: ProjectStatus.BLOCKED },
      select: { id: true, title: true, type: true, nextAction: true, notes: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 24,
    }),
    db.painting.count({
      where: {
        availability: "Sold",
        project: { archivedAt: null },
        OR: [{ materialsCostCents: null }, { framingCostCents: null }],
        sales: { some: { status: "Active" } },
      },
    }),
    db.campaign.findMany({
      where: { status: { in: activeCampaignStatuses } },
      include: { tasks: { where: { completed: false }, orderBy: { dueDate: "asc" } } },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
  ]);
  const blocked = blockedCandidates.filter((project) => !isMuseumInfrastructureNotes(project.notes)).slice(0, 8);
  const today = new Date().toISOString().slice(0, 10);
  const lines = [`Blocked operational projects: ${blocked.length} shown. Sold artworks with missing material/framing cost data: ${costGapCount}. Museum infrastructure is excluded.`];
  const refs: string[] = [];
  for (const project of blocked) {
    lines.push(`Blocked: ${project.type} · ${project.title}${project.nextAction ? ` · next: ${textField(project.nextAction, 120)}` : ""}`);
    refs.push(`project:${project.id}`);
  }
  for (const campaign of campaigns) {
    const overdue = campaign.tasks.filter((task) => task.dueDate < today).length;
    if (overdue) {
      lines.push(`Campaign risk: ${campaign.title} has ${overdue} overdue task${overdue === 1 ? "" : "s"}.`);
      refs.push(`campaign:${campaign.id}`);
    }
  }
  return finalize(museId, category, lines, refs);
}

async function experimentContext(db: ContextDb, museId: MuseId, category: ProposalCategory) {
  const ventures = await db.venture.findMany({
    where: { archivedAt: null, status: { in: [VentureStatus.IDEA, VentureStatus.VALIDATING, VentureStatus.ACTIVE] } },
    select: { id: true, name: true, status: true, demand: true, margin: true, recurrence: true, automation: true, weeklyHours: true, nextAction: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
    take: 8,
  });
  const lines = [`Current venture/experiment candidates: ${ventures.length} shown.`];
  const refs: string[] = [];
  for (const venture of ventures) {
    lines.push(`${venture.name} · ${venture.status} · demand ${venture.demand}/5 · margin ${venture.margin}/5 · recurrence ${venture.recurrence}/5 · automation ${venture.automation}/5 · weekly-hours score ${venture.weeklyHours}/5${venture.nextAction ? ` · next: ${textField(venture.nextAction, 90)}` : ""}`);
    refs.push(`venture:${venture.id}`);
  }
  return finalize(museId, category, lines, refs);
}

async function genericProjectContext(db: ContextDb, museId: MuseId, category: ProposalCategory) {
  const candidates = await db.project.findMany({
    where: { archivedAt: null, status: { in: [ProjectStatus.ACTIVE, ProjectStatus.WAITING, ProjectStatus.BLOCKED] } },
    select: { id: true, title: true, type: true, status: true, dueDate: true, nextAction: true, notes: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
    take: 30,
  });
  const projects = candidates.filter((project) => !isMuseumInfrastructureNotes(project.notes)).slice(0, 10);
  const lines = [`Relevant live operational state: ${projects.length} recent active/waiting/blocked records shown. Museum infrastructure is excluded.`];
  const refs: string[] = [];
  for (const project of projects) {
    lines.push(`${project.type} · ${project.title} · ${project.status} · due ${isoDay(project.dueDate)}${project.nextAction ? ` · next: ${textField(project.nextAction, 100)}` : ""}`);
    refs.push(`project:${project.id}`);
  }
  return finalize(museId, category, lines, refs);
}

export async function buildIntelligenceContextPacket(db: ContextDb, museId: MuseId, category: ProposalCategory): Promise<IntelligenceContextPacket> {
  if (category === "product") return productContext(db, museId, category);
  if (category === "revenue") return revenueContext(db, museId, category);
  if (category === "content") return contentContext(db, museId, category);
  if (category === "capacity") return capacityContext(db, museId, category);
  if (category === "risk") return riskContext(db, museId, category);
  if (category === "experiment") return experimentContext(db, museId, category);
  return genericProjectContext(db, museId, category);
}
