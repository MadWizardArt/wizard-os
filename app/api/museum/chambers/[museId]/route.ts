import { NextRequest, NextResponse } from "next/server";
import {
  createMuseumChamber,
  decodeMuseumChamber,
  MUSEUM_CHAMBER_PREFIX,
  type StoredMuseumChamber,
} from "../../../../../lib/museum-chamber-storage";
import { isMuseId, type MuseId } from "../../../../../lib/museum";
import { prisma } from "../../../../../lib/prisma";
import { ProjectType } from "../../../../generated/prisma/client";

export const runtime = "nodejs";

type ChamberRecord = {
  id: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
};

async function findLegacyChamber(museId: MuseId): Promise<ChamberRecord | null> {
  const records = await prisma.project.findMany({
    where: {
      type: ProjectType.INTERNAL,
      notes: { startsWith: MUSEUM_CHAMBER_PREFIX },
    },
    select: { id: true, notes: true, createdAt: true, updatedAt: true, archivedAt: true },
    orderBy: { updatedAt: "desc" },
    take: 24,
  });
  return records.find((record) => decodeMuseumChamber(record.notes)?.museId === museId) ?? null;
}

function serialize(record: ChamberRecord | null, chamber: StoredMuseumChamber) {
  return {
    id: record?.id ?? null,
    museId: chamber.museId,
    messages: chamber.messages,
    createdAt: record?.createdAt ?? null,
    updatedAt: record?.updatedAt ?? null,
    retired: true,
    archived: Boolean(record?.archivedAt),
  };
}

export async function GET(_request: NextRequest, context: { params: Promise<{ museId: string }> }) {
  const { museId } = await context.params;
  if (!isMuseId(museId)) return NextResponse.json({ error: "Unknown Muse." }, { status: 404 });
  const record = await findLegacyChamber(museId);
  const chamber = record ? decodeMuseumChamber(record.notes) : createMuseumChamber(museId);
  return NextResponse.json(serialize(record, chamber ?? createMuseumChamber(museId)));
}

export async function POST(_request: NextRequest, context: { params: Promise<{ museId: string }> }) {
  const { museId } = await context.params;
  if (!isMuseId(museId)) return NextResponse.json({ error: "Unknown Muse." }, { status: 404 });
  return NextResponse.json({
    error: "Legacy Chamber chat is retired. Use Selective Intelligence for powered Muse reasoning.",
    retired: true,
    intelligencePath: "/museum/intelligence",
  }, { status: 410 });
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ museId: string }> }) {
  const { museId } = await context.params;
  if (!isMuseId(museId)) return NextResponse.json({ error: "Unknown Muse." }, { status: 404 });
  return NextResponse.json({
    error: "Legacy Chamber chat is retired; its records are archived read-only.",
    retired: true,
  }, { status: 410 });
}
