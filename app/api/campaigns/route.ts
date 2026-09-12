import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import {
  campaignStatuses,
  taskCategories,
  validDate,
  goalReceived,
  receiptValue,
} from "../../../lib/campaign-rules";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const priorTitle =
  "2026 Painting Sales — September + Black Friday — $14000 Goal";
const defaultGoal = {
  id: "painting-2026",
  targetCents: 1400000,
  startDate: "2026-01-01",
  dueDate: "2026-12-31",
  basis: "Gross artwork receipts",
  excludeSalesTax: true,
  excludeShipping: true,
};
const include = {
  tasks: { orderBy: { dueDate: "asc" as const } },
  artwork: { include: { painting: { include: { project: true } } } },
  content: { orderBy: { postingDate: "asc" as const } },
  batches: { include: { _count: { select: { paintings: true } } } },
  project: { select: { id: true, title: true } },
};
function required(v: unknown, label: string) {
  if (typeof v !== "string" || !v.trim())
    throw new Error(`${label} is required.`);
  return v.trim();
}
function date(v: unknown) {
  if (!validDate(v)) throw new Error("Enter a valid date.");
  return v;
}
function cents(v: unknown, nullable = false): number {
  if ((v === "" || v == null) && nullable) return 0;
  const n = Number(v);
  if (
    v === "" ||
    v == null ||
    !Number.isSafeInteger(n) ||
    n < 0 ||
    n > 2000000000
  )
    throw new Error("Enter a valid amount in cents.");
  return n;
}
function choice(v: unknown, options: string[]) {
  if (typeof v !== "string" || !options.includes(v))
    throw new Error("Choose a valid status or category.");
  return v;
}
function windowDates(start: unknown, end: unknown) {
  const s = date(start),
    e = date(end);
  if (e < s) throw new Error("End date must be on or after start date.");
  return { startDate: s, endDate: e };
}

export async function GET() {
  try {
    const [
      campaigns,
      paintings,
      projects,
      transactions,
      savedGoal,
      priorWorkOrders,
    ] = await Promise.all([
      prisma.campaign.findMany({ include, orderBy: { startDate: "asc" } }),
      prisma.painting.findMany({ include: { project: true } }),
      prisma.project.findMany({
        where: { type: "ARTWORK", archivedAt: null },
        include: { stages: true, artwork: true },
      }),
      prisma.transaction.findMany({
        where: { type: { in: ["INCOME", "REFUND"] } },
        include: { project: { select: { type: true, title: true } } },
        orderBy: { receivedAt: "desc" },
      }),
      prisma.salesGoal.findUnique({ where: { id: defaultGoal.id } }),
      prisma.project.findMany({
        where: { title: { equals: priorTitle, mode: "insensitive" } },
        include: { stages: true },
      }),
    ]);
    const goal = savedGoal ?? defaultGoal;
    return NextResponse.json(
      {
        campaigns: campaigns.map((c) => ({
          ...c,
          receivedCents: transactions
            .filter((t) => t.campaignId === c.id)
            .reduce((s, t) => s + receiptValue(t, goal), 0),
        })),
        paintings,
        projects,
        transactions,
        goal: { ...goal, receivedCents: goalReceived(transactions, goal) },
        priorWorkOrders,
        initialized:
          !!savedGoal &&
          campaigns.some((c) => c.id === "studio-september-2026" || (c.title === "End-of-September Studio Sale" && c.startDate === "2026-09-25")) &&
          campaigns.some((c) => c.id === "winter-black-friday-2026" || (c.title === "Black Friday Winter Art Sale" && c.startDate === "2026-11-27")),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Campaign read failed", error);
    return NextResponse.json(
      {
        error:
          "Campaign storage is unavailable. No fallback or demonstration records are shown. Please retry.",
      },
      { status: 503 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const b = await request.json();
    let result: unknown;
    switch (b.action) {
      case "initialize": {
        result = await prisma.$transaction(async (tx) => {
          // Serialize repeat requests. The exact prior title is checked, including archived projects, before creating anything.
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(2026092501)`;
          const prior = await tx.project.findMany({
            where: { title: { equals: priorTitle, mode: "insensitive" } },
            orderBy: { createdAt: "asc" },
          });
          const parent =
            prior[0] ??
            (await tx.project.create({
              data: {
                title: priorTitle,
                type: "INTERNAL",
                notes:
                  "Painting sales plan. Annual target is separate from qualifying monthly income.",
                dueDate: new Date("2026-12-31T17:00:00Z"),
              },
            }));
          const definitions = [
            {
              id: "studio-september-2026",
              title: "End-of-September Studio Sale",
              startDate: "2026-09-25",
              endDate: "2026-09-30",
              targetCents: 400000,
            },
            {
              id: "winter-black-friday-2026",
              title: "Black Friday Winter Art Sale",
              startDate: "2026-11-27",
              endDate: "2026-11-30",
              targetCents: 600000,
            },
          ];
          for (const c of definitions) {
            const existing = await tx.campaign.findFirst({
              where: {
                OR: [{ id: c.id }, { title: c.title, startDate: c.startDate }],
              },
            });
            if (!existing)
              await tx.campaign.create({
                data: { ...c, projectId: parent.id, notes: parent.notes ?? "" },
              });
          }
          const winter = await tx.campaign.findFirstOrThrow({
            where: {
              OR: [{id: definitions[1].id}, {title: definitions[1].title, startDate: definitions[1].startDate}],
            },
          });
          await tx.productionBatch.upsert({
            where: { id: "winter-small-2026" },
            update: {},
            create: {
              id: "winter-small-2026",
              campaignId: winter.id,
              title: "Small framed winter paintings",
              plannedQuantity: 30,
              weeklyQuantity: 5,
              unitPriceCents: 10000,
              startDate: "2026-10-05",
              completionDate: "2026-11-13",
            },
          });
          for (let i = 0; i < 6; i++) {
            const due = new Date("2026-10-09T12:00:00Z");
            due.setUTCDate(due.getUTCDate() + i * 7);
            await tx.campaignTask.upsert({
              where: { id: `winter-week-${i + 1}-2026` },
              update: {},
              create: {
                id: `winter-week-${i + 1}-2026`,
                campaignId: winter.id,
                title: `Paint five winter paintings · week ${i + 1}`,
                category: "Painting",
                dueDate: due.toISOString().slice(0, 10),
              },
            });
          }
          await tx.salesGoal.upsert({
            where: { id: defaultGoal.id },
            update: {},
            create: defaultGoal,
          });
          return {
            reusedWorkOrder: prior.length > 0,
            workOrderId: parent.id,
            matchingWorkOrders: prior.length,
          };
        });
        break;
      }
      case "campaign": {
        const data = {
          title: required(b.title, "Title"),
          status: choice(b.status, campaignStatuses),
          ...windowDates(b.startDate, b.endDate),
          targetCents: cents(b.targetCents),
          notes: typeof b.notes === "string" ? b.notes : "",
        };
        result = b.id
          ? await prisma.campaign.update({ where: { id: b.id }, data })
          : await prisma.campaign.create({ data });
        break;
      }
      case "task": {
        const dueTime = b.dueTime || null;
        if (dueTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(dueTime))
          throw new Error("Enter a valid Eastern time.");
        const data = {
          title: required(b.title, "Task"),
          dueDate: date(b.dueDate),
          dueTime,
          category: choice(b.category, taskCategories),
          completed: b.completed === true,
        };
        result = b.id
          ? await prisma.campaignTask.update({ where: { id: b.id }, data })
          : await prisma.campaignTask.create({
              data: { ...data, campaignId: required(b.campaignId, "Campaign") },
            });
        break;
      }
      case "completeTask":
        result = await prisma.campaignTask.update({
          where: { id: required(b.id, "Task") },
          data: { completed: b.completed === true },
        });
        break;
      case "deleteTask":
        result = await prisma.campaignTask.delete({
          where: { id: required(b.id, "Task") },
        });
        break;
      case "content": {
        const data = {
          title: required(b.title, "Title"),
          text: typeof b.text === "string" ? b.text : "",
          postingDate: date(b.postingDate),
          status: choice(b.status, ["Draft", "Posted"]),
        };
        result = b.id
          ? await prisma.campaignContent.update({ where: { id: b.id }, data })
          : await prisma.campaignContent.create({
              data: { ...data, campaignId: required(b.campaignId, "Campaign") },
            });
        break;
      }
      case "painting": {
        const thumbnail =
          typeof b.thumbnail === "string" ? b.thumbnail.trim() : "";
        if (thumbnail && !/^https?:\/\//.test(thumbnail))
          throw new Error("Use an HTTP or HTTPS thumbnail URL.");
        const data = {
          thumbnail,
          dimensions: typeof b.dimensions === "string" ? b.dimensions : "",
          medium: typeof b.medium === "string" ? b.medium : "",
          framing: typeof b.framing === "string" ? b.framing : "",
          availability: choice(b.availability, [
            "Available",
            "Reserved",
            "Sold",
            "Not ready",
          ]),
          regularPriceCents:
            b.regularPriceCents == null ? null : cents(b.regularPriceCents),
          batchId: b.batchId || null,
        };
        result = await prisma.$transaction(async (tx) => {
          let projectId = b.projectId;
          if (projectId) {
            const p = await tx.project.findUniqueOrThrow({
              where: { id: projectId },
            });
            if (p.type !== "ARTWORK")
              throw new Error("Choose an artwork project.");
            await tx.project.update({
              where: { id: projectId },
              data: { title: required(b.title, "Title") },
            });
          } else {
            const template = await tx.workflowTemplate.findFirst({
              where: { projectType: "ARTWORK" },
              include: { stages: { orderBy: { position: "asc" } } },
            });
            const p = await tx.project.create({
              data: {
                title: required(b.title, "Title"),
                type: "ARTWORK",
                templateId: template?.id,
                stages: {
                  create: template?.stages.map((s) => ({
                    name: s.name,
                    position: s.position,
                    fieldsJson: s.defaultFieldsJson,
                  })) ?? [
                    { name: "Paint", position: 0 },
                    { name: "Prepare for sale", position: 1 },
                    { name: "Fulfill", position: 2 },
                  ],
                },
              },
            });
            projectId = p.id;
          }
          return tx.painting.upsert({
            where: { projectId },
            update: data,
            create: { projectId, ...data },
          });
        });
        break;
      }
      case "linkPainting": {
        const campaignId = required(b.campaignId, "Campaign"),
          projectId = required(b.projectId, "Painting");
        const salePriceCents =
          b.salePriceCents == null ? null : cents(b.salePriceCents);
        result = await prisma.$transaction(async (tx) => {
          const p = await tx.project.findUniqueOrThrow({
            where: { id: projectId },
            include: { artwork: true, stages: true },
          });
          if (p.type !== "ARTWORK")
            throw new Error("Choose an artwork project.");
          if (!p.artwork) {
            const fields = p.stages.map((s) => {
              try {
                return JSON.parse(s.fieldsJson);
              } catch {
                return {};
              }
            });
            const pick = (key: string) =>
              fields.find((f) => f[key] != null)?.[key];
            const price = pick("price");
            await tx.painting.create({
              data: {
                projectId,
                regularPriceCents:
                  price && Number.isFinite(Number(price))
                    ? Math.round(Number(price) * 100)
                    : p.valueCents,
                availability: pick("sold") === true ? "Sold" : "Available",
                dimensions: String(pick("dimensions") ?? ""),
                medium: String(pick("medium") ?? ""),
              },
            });
          }
          return tx.campaignPainting.upsert({
            where: { campaignId_projectId: { campaignId, projectId } },
            update: { salePriceCents },
            create: { campaignId, projectId, salePriceCents },
          });
        });
        break;
      }
      case "unlinkPainting":
        result = await prisma.campaignPainting.delete({
          where: {
            campaignId_projectId: {
              campaignId: required(b.campaignId, "Campaign"),
              projectId: required(b.projectId, "Painting"),
            },
          },
        });
        break;
      case "batch": {
        const plannedQuantity = Number(b.plannedQuantity),
          weeklyQuantity = Number(b.weeklyQuantity);
        if (
          !Number.isInteger(plannedQuantity) ||
          plannedQuantity < 1 ||
          !Number.isInteger(weeklyQuantity) ||
          weeklyQuantity < 1
        )
          throw new Error("Quantities must be positive whole numbers.");
        const dates = windowDates(b.startDate, b.completionDate);
        const data = {
          title: required(b.title, "Title"),
          plannedQuantity,
          weeklyQuantity,
          unitPriceCents: cents(b.unitPriceCents),
          startDate: dates.startDate,
          completionDate: dates.endDate,
        };
        result = b.id
          ? await prisma.productionBatch.update({ where: { id: b.id }, data })
          : await prisma.productionBatch.create({
              data: { ...data, campaignId: required(b.campaignId, "Campaign") },
            });
        break;
      }
      case "goal": {
        const dates = windowDates(b.startDate, b.dueDate);
        const data = {
          targetCents: cents(b.targetCents),
          startDate: dates.startDate,
          dueDate: dates.endDate,
          basis: required(b.basis, "Basis"),
          excludeSalesTax: b.excludeSalesTax === true,
          excludeShipping: b.excludeShipping === true,
        };
        result = await prisma.salesGoal.upsert({
          where: { id: defaultGoal.id },
          update: data,
          create: { id: defaultGoal.id, ...data },
        });
        break;
      }
      case "linkReceipt": {
        result = await prisma.$transaction(async (tx) => {
          const t = await tx.transaction.findUniqueOrThrow({
            where: { id: required(b.id, "Receipt") },
          });
          if (!t.receivedAt || t.type === "EXPENSE" || t.isNonArt)
            throw new Error("Choose a received artwork payment or refund.");
          if (t.campaignId && t.campaignId !== b.campaignId)
            throw new Error(
              "This receipt is already assigned to another campaign.",
            );
          return tx.transaction.update({
            where: { id: t.id },
            data: {
              campaignId: required(b.campaignId, "Campaign"),
              isArtworkReceipt: true,
            },
          });
        });
        break;
      }
      case "receipt": {
        const amountCents = cents(b.amountCents),
          salesTaxCents = cents(b.salesTaxCents),
          shippingCents = cents(b.shippingCents);
        if (amountCents <= 0 || salesTaxCents + shippingCents > amountCents)
          throw new Error(
            "Payment must be positive, with tax and shipping no greater than its total.",
          );
        const receivedAt = new Date(date(b.receivedDate) + "T17:00:00Z");
        const type = choice(b.type, ["INCOME", "REFUND"]) as
          "INCOME" | "REFUND";
        const receiptKey = required(b.receiptKey, "Receipt key");
        result = await prisma.$transaction(
          async (tx) => {
            const existing = await tx.transaction.findUnique({
              where: { receiptKey },
            });
            if (existing) return existing;
            if (b.projectId) {
              const p = await tx.painting.findUniqueOrThrow({
                where: { projectId: b.projectId },
              });
              if (type === "INCOME" && b.markSold && p.availability === "Sold")
                throw new Error(
                  "Already sold. Record an additional payment without marking sold again.",
                );
              if (b.campaignId) {
                await tx.campaignPainting.findUniqueOrThrow({
                  where: {
                    campaignId_projectId: {
                      campaignId: b.campaignId,
                      projectId: b.projectId,
                    },
                  },
                });
              }
            }
            const t = await tx.transaction.create({
              data: {
                receiptKey,
                type,
                amountCents,
                salesTaxCents,
                shippingCents,
                receivedAt,
                occurredAt: receivedAt,
                source: required(b.source, "Source"),
                incomeClass: "ACTIVE",
                isNonArt: false,
                isArtworkReceipt: true,
                campaignId: b.campaignId || null,
                projectId: b.projectId || null,
                notes: typeof b.notes === "string" ? b.notes : null,
              },
            });
            if (b.projectId && b.markSold && type === "INCOME")
              await tx.painting.update({
                where: { projectId: b.projectId },
                data: { availability: "Sold" },
              });
            return t;
          },
          { isolationLevel: "Serializable" },
        );
        break;
      }
      default:
        throw new Error("Unknown campaign action.");
    }
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    const error = e as { code?: string; message?: string };
    const message =
      error.code === "P2002" || error.code === "P2034"
        ? "This record changed while saving. Refresh and try again."
        : error.code
          ? "Could not save: a linked record is missing or unavailable."
          : (error.message ?? "Could not save.");
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
