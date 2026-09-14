import { Prisma, ProjectStatus, ProjectType } from "../app/generated/prisma/client";
import type { MuseId } from "./museum";
import {
  decodeMuseSignal,
  encodeMuseSignal,
  MUSEUM_SIGNAL_PREFIX,
  type MuseSignalPresence,
  type MuseSignalPriority,
  type MuseSignalType,
  type StoredMuseSignal,
} from "./museum-signal-storage";

export type MuseSignalInput = {
  museId: MuseId;
  title: string;
  summary: string;
  type: MuseSignalType;
  area: string;
  priority?: MuseSignalPriority;
  visualState?: MuseSignalPresence;
  relatedProjectId?: string | null;
  sourceKey: string;
  occurredAt?: Date;
};

type SignalDb = Pick<Prisma.TransactionClient, "project">;

const defaultVisualState: Record<MuseSignalType, MuseSignalPresence> = {
  update: "working",
  recommendation: "waiting",
  waiting: "waiting",
  completed: "available",
  warning: "working",
  urgent: "waiting",
};

export async function emitMuseSignal(db: SignalDb, input: MuseSignalInput) {
  const existing = await db.project.findFirst({
    where: {
      type: ProjectType.INTERNAL,
      archivedAt: null,
      notes: { startsWith: MUSEUM_SIGNAL_PREFIX, contains: input.sourceKey },
    },
    select: { id: true, notes: true },
  });
  if (existing && decodeMuseSignal(existing.notes)?.sourceKey === input.sourceKey) {
    return { id: existing.id, created: false };
  }

  const signal: StoredMuseSignal = {
    version: 1,
    museId: input.museId,
    title: input.title.trim().slice(0, 140),
    summary: input.summary.trim().slice(0, 600),
    type: input.type,
    area: input.area.trim().slice(0, 120),
    priority: input.priority ?? (input.type === "urgent" ? "urgent" : input.type === "warning" ? "high" : "normal"),
    visualState: input.visualState ?? defaultVisualState[input.type],
    relatedProjectId: input.relatedProjectId?.trim().slice(0, 120) || null,
    sourceKey: input.sourceKey.trim().slice(0, 220),
    occurredAt: (input.occurredAt ?? new Date()).toISOString(),
    readAt: null,
    acknowledgedAt: null,
  };

  if (!signal.title || !signal.summary || !signal.area || !signal.sourceKey) {
    throw new Error("Museum signal is missing required content.");
  }

  const record = await db.project.create({
    data: {
      title: `Museum · ${signal.title}`,
      type: ProjectType.INTERNAL,
      status: ProjectStatus.ACTIVE,
      progress: 0,
      nextAction: "Review in Museum",
      notes: encodeMuseSignal(signal),
    },
    select: { id: true },
  });

  return { id: record.id, created: true };
}
