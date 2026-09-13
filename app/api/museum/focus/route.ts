import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { isMuseId } from "../../../../lib/museum";
import {
  decodeMuseumFocusBoard,
  encodeMuseumFocusBoard,
  MUSEUM_FOCUS_PREFIX,
  type MuseFocus,
  type StoredMuseumFocusBoard,
} from "../../../../lib/museum-focus-storage";
import { ProjectStatus, ProjectType } from "../../../generated/prisma/client";

export const runtime = "nodejs";

const FOCUS_TITLE = "Museum Focus Board";

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function findBoardRecord() {
  return prisma.project.findFirst({
    where: {
      type: ProjectType.INTERNAL,
      archivedAt: null,
      notes: { startsWith: MUSEUM_FOCUS_PREFIX },
    },
    select: { id: true, notes: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });
}

async function loadBoard(): Promise<{ id: string | null; board: StoredMuseumFocusBoard }> {
  const record = await findBoardRecord();
  const decoded = record ? decodeMuseumFocusBoard(record.notes) : null;
  return { id: record?.id ?? null, board: decoded ?? { version: 1, focuses: [] } };
}

async function persistBoard(id: string | null, board: StoredMuseumFocusBoard) {
  if (id) {
    return prisma.project.update({
      where: { id },
      data: {
        title: FOCUS_TITLE,
        status: ProjectStatus.ACTIVE,
        progress: 0,
        nextAction: "Review Museum current focuses",
        notes: encodeMuseumFocusBoard(board),
      },
      select: { id: true, updatedAt: true },
    });
  }

  return prisma.project.create({
    data: {
      title: FOCUS_TITLE,
      type: ProjectType.INTERNAL,
      status: ProjectStatus.ACTIVE,
      progress: 0,
      nextAction: "Review Museum current focuses",
      notes: encodeMuseumFocusBoard(board),
    },
    select: { id: true, updatedAt: true },
  });
}

export async function GET() {
  const { board } = await loadBoard();
  return NextResponse.json(board.focuses);
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  if (!isMuseId(body.museId)) return NextResponse.json({ error: "Choose a valid Muse." }, { status: 400 });

  const { id, board } = await loadBoard();
  const remaining = board.focuses.filter((focus) => focus.museId !== body.museId);

  if (body.clear === true) {
    await persistBoard(id, { version: 1, focuses: remaining });
    return NextResponse.json({ cleared: true, museId: body.museId });
  }

  const title = clean(body.title, 140);
  const nextAction = clean(body.nextAction, 500);
  const linkedProjectId = clean(body.linkedProjectId, 120) || null;
  if (!title) return NextResponse.json({ error: "Current Focus needs a title." }, { status: 400 });

  if (linkedProjectId) {
    const linked = await prisma.project.findFirst({ where: { id: linkedProjectId, archivedAt: null }, select: { id: true } });
    if (!linked) return NextResponse.json({ error: "The linked Wizard OS project could not be found." }, { status: 400 });
  }

  const focus: MuseFocus = { museId: body.museId, title, nextAction, linkedProjectId };
  await persistBoard(id, { version: 1, focuses: [...remaining, focus] });
  return NextResponse.json(focus);
}
