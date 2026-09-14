import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { isMuseId } from "../../../../lib/museum";
import {
  decodeMuseSignal,
  encodeMuseSignal,
  MUSEUM_SIGNAL_PREFIX,
} from "../../../../lib/museum-signal-storage";
import { ProjectStatus, ProjectType } from "../../../generated/prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const museParam = request.nextUrl.searchParams.get("muse");
  const museId = museParam && isMuseId(museParam) ? museParam : null;

  const records = await prisma.project.findMany({
    where: {
      type: ProjectType.INTERNAL,
      archivedAt: null,
      notes: { startsWith: MUSEUM_SIGNAL_PREFIX },
    },
    select: { id: true, notes: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 80,
  });

  const signals = records
    .map((record) => {
      const signal = decodeMuseSignal(record.notes);
      return signal ? { id: record.id, ...signal } : null;
    })
    .filter((signal): signal is NonNullable<typeof signal> => Boolean(signal))
    .filter((signal) => !museId || signal.museId === museId)
    .slice(0, museId ? 20 : 40);

  return NextResponse.json(signals);
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const id = typeof body.id === "string" ? body.id.trim() : "";
  const action = body.action === "acknowledge" ? "acknowledge" : body.action === "read" ? "read" : null;
  if (!id || !action) return NextResponse.json({ error: "Choose a signal and action." }, { status: 400 });

  const record = await prisma.project.findFirst({
    where: {
      id,
      type: ProjectType.INTERNAL,
      archivedAt: null,
      notes: { startsWith: MUSEUM_SIGNAL_PREFIX },
    },
    select: { id: true, notes: true },
  });
  const signal = record ? decodeMuseSignal(record.notes) : null;
  if (!record || !signal) return NextResponse.json({ error: "Museum signal not found." }, { status: 404 });

  const now = new Date().toISOString();
  const updated = {
    ...signal,
    readAt: signal.readAt ?? now,
    acknowledgedAt: action === "acknowledge" ? signal.acknowledgedAt ?? now : signal.acknowledgedAt,
  };

  await prisma.project.update({
    where: { id: record.id },
    data: {
      notes: encodeMuseSignal(updated),
      status: action === "acknowledge" ? ProjectStatus.COMPLETE : ProjectStatus.ACTIVE,
      nextAction: action === "acknowledge" ? "Acknowledged in Museum" : "Review in Museum",
    },
  });

  return NextResponse.json({ id: record.id, ...updated });
}
