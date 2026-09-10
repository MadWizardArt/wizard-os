import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const rawMonth = request.nextUrl.searchParams.get("month");
  const month = rawMonth && /^\d{4}-\d{2}$/.test(rawMonth) ? rawMonth : new Date().toISOString().slice(0, 7);
  const [year, monthNumber] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, monthNumber - 1, 1));
  const end = new Date(Date.UTC(year, monthNumber, 1));
  const received = await prisma.transaction.findMany({
    where: { receivedAt: { gte: start, lt: end }, type: { in: ["INCOME", "REFUND"] } },
  });

  const signed = (transaction: typeof received[number]) => transaction.type === "REFUND" ? -transaction.amountCents : transaction.amountCents;
  const totalCents = received.reduce((sum, transaction) => sum + signed(transaction), 0);
  const qualifying = received.filter((transaction) => transaction.isNonArt && (transaction.incomeClass === "RECURRING" || transaction.incomeClass === "PASSIVE_LIKE"));
  const qualifyingCents = qualifying.reduce((sum, transaction) => sum + signed(transaction), 0);
  const targets = [100000, 250000, 500000].map((targetCents) => ({
    targetCents,
    progress: Math.max(0, Math.min(100, Math.round((qualifyingCents / targetCents) * 100))),
    remainingCents: Math.max(0, targetCents - qualifyingCents),
  }));
  const nextTarget = targets.find((target) => qualifyingCents < target.targetCents) ?? targets[targets.length - 1];

  return NextResponse.json({ month, totalCents, qualifyingCents, qualifyingShare: totalCents > 0 ? Math.round((qualifyingCents / totalCents) * 1000) / 10 : 0, targets, nextTarget, qualifyingTransactions: qualifying });
}
