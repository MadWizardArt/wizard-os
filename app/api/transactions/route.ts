import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { IncomeClass, TransactionType } from "../../generated/prisma/client";

export const runtime = "nodejs";

function monthRange(month: string | null) {
  const valid = month && /^\d{4}-\d{2}$/.test(month) ? month : new Date().toISOString().slice(0, 7);
  const [year, monthNumber] = valid.split("-").map(Number);
  return { start: new Date(Date.UTC(year, monthNumber - 1, 1)), end: new Date(Date.UTC(year, monthNumber, 1)) };
}

export async function GET(request: NextRequest) {
  const { start, end } = monthRange(request.nextUrl.searchParams.get("month"));
  const transactions = await prisma.transaction.findMany({
    where: { occurredAt: { gte: start, lt: end } },
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
  });
  return NextResponse.json(transactions);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const amount = Number(body.amount);
  if (!Object.values(TransactionType).includes(body.type)) return NextResponse.json({ error: "Choose a valid transaction type." }, { status: 400 });
  if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: "Enter an amount greater than zero." }, { status: 400 });
  if (typeof body.source !== "string" || !body.source.trim()) return NextResponse.json({ error: "Source is required." }, { status: 400 });
  if (!body.occurredAt) return NextResponse.json({ error: "Date is required." }, { status: 400 });
  const isIncomeLike = body.type === TransactionType.INCOME || body.type === TransactionType.REFUND;
  if (isIncomeLike && !Object.values(IncomeClass).includes(body.incomeClass)) return NextResponse.json({ error: "Classify the income." }, { status: 400 });

  const transaction = await prisma.transaction.create({
    data: {
      type: body.type,
      amountCents: Math.round(amount * 100),
      occurredAt: new Date(`${body.occurredAt}T12:00:00Z`),
      receivedAt: isIncomeLike ? new Date(`${body.receivedAt || body.occurredAt}T12:00:00Z`) : null,
      source: body.source.trim(),
      incomeClass: isIncomeLike ? body.incomeClass : null,
      isNonArt: isIncomeLike ? Boolean(body.isNonArt) : false,
      notes: typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null,
      projectId: body.projectId || null,
    },
  });
  return NextResponse.json(transaction, { status: 201 });
}
