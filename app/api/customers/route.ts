import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { CustomerStatus, CustomerType } from "../../generated/prisma/client";

export const runtime = "nodejs";

export async function GET() {
  const customers = await prisma.customer.findMany({
    where: { archivedAt: null },
    include: { _count: { select: { projects: true, transactions: true } }, transactions: { select: { type: true, amountCents: true } } },
    orderBy: [{ lastContactAt: "desc" }, { name: "asc" }],
  });
  return NextResponse.json(customers.map(({ transactions, ...customer }) => ({
    ...customer,
    receivedCents: transactions.reduce((total, item) => total + (item.type === "INCOME" ? item.amountCents : item.type === "REFUND" ? -item.amountCents : 0), 0),
  })));
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });
  if (!Object.values(CustomerType).includes(body.type)) return NextResponse.json({ error: "Choose a valid customer type." }, { status: 400 });
  if (!Object.values(CustomerStatus).includes(body.status)) return NextResponse.json({ error: "Choose a valid status." }, { status: 400 });
  const customer = await prisma.customer.create({ data: {
    name, type: body.type, status: body.status,
    email: body.email?.trim() || null, phone: body.phone?.trim() || null,
    notes: body.notes?.trim() || null,
    lastContactAt: body.lastContactAt ? new Date(`${body.lastContactAt}T12:00:00Z`) : null,
  }});
  return NextResponse.json(customer, { status: 201 });
}
