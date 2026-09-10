import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { IncomeClass, TransactionType } from "../../../generated/prisma/client";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: Context) {
  const { id } = await context.params;
  const body = await request.json();
  const amount = Number(body.amount);
  if (!Object.values(TransactionType).includes(body.type) || !Number.isFinite(amount) || amount <= 0 || !body.source?.trim() || !body.occurredAt) {
    return NextResponse.json({ error: "Type, positive amount, source, and date are required." }, { status: 400 });
  }
  const isIncomeLike = body.type === TransactionType.INCOME || body.type === TransactionType.REFUND;
  if (isIncomeLike && !Object.values(IncomeClass).includes(body.incomeClass)) return NextResponse.json({ error: "Classify the income." }, { status: 400 });
  try {
    return NextResponse.json(await prisma.transaction.update({ where: { id }, data: {
      type: body.type,
      amountCents: Math.round(amount * 100),
      occurredAt: new Date(`${body.occurredAt}T12:00:00Z`),
      receivedAt: isIncomeLike ? new Date(`${body.receivedAt || body.occurredAt}T12:00:00Z`) : null,
      source: body.source.trim(), incomeClass: isIncomeLike ? body.incomeClass : null,
      isNonArt: isIncomeLike ? Boolean(body.isNonArt) : false,
      notes: body.notes?.trim() || null, projectId: body.projectId || null,
    }}));
  } catch { return NextResponse.json({ error: "Transaction not found." }, { status: 404 }); }
}

export async function DELETE(_request: NextRequest, context: Context) {
  const { id } = await context.params;
  try { await prisma.transaction.delete({ where: { id } }); return new NextResponse(null, { status: 204 }); }
  catch { return NextResponse.json({ error: "Transaction not found." }, { status: 404 }); }
}
