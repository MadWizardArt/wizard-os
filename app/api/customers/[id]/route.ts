import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { CustomerStatus, CustomerType } from "../../../generated/prisma/client";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: Context) {
  const { id } = await context.params;
  const customer = await prisma.customer.findUnique({ where: { id }, include: {
    projects: { where: { archivedAt: null }, orderBy: { updatedAt: "desc" } },
    transactions: { orderBy: { occurredAt: "desc" } },
  }});
  return customer ? NextResponse.json(customer) : NextResponse.json({ error: "Customer not found." }, { status: 404 });
}

export async function PATCH(request: NextRequest, context: Context) {
  const { id } = await context.params;
  const body = await request.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });
  if (!Object.values(CustomerType).includes(body.type) || !Object.values(CustomerStatus).includes(body.status)) return NextResponse.json({ error: "Choose a valid type and status." }, { status: 400 });
  try {
    return NextResponse.json(await prisma.customer.update({ where: { id }, data: {
      name, type: body.type, status: body.status,
      email: body.email?.trim() || null, phone: body.phone?.trim() || null,
      notes: body.notes?.trim() || null,
      lastContactAt: body.lastContactAt ? new Date(`${body.lastContactAt}T12:00:00Z`) : null,
    }}));
  } catch { return NextResponse.json({ error: "Customer not found." }, { status: 404 }); }
}

export async function DELETE(_request: NextRequest, context: Context) {
  const { id } = await context.params;
  try {
    return NextResponse.json(await prisma.customer.update({ where: { id }, data: { status: CustomerStatus.ARCHIVED, archivedAt: new Date() } }));
  } catch { return NextResponse.json({ error: "Customer not found." }, { status: 404 }); }
}
