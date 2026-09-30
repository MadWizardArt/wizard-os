import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { isWarlockOperatorRequest } from "../../../../lib/warlock-auth";
import { intakeProduct } from "../../../../lib/warlock-intake";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;
export async function POST(request: NextRequest) {
  if (!isWarlockOperatorRequest(request)) return NextResponse.json({ error: "warlock_operator_required" }, { status: 401 });
  const body = await request.json().catch(() => null);
  try {
    const result = await intakeProduct(body, prisma);
    return NextResponse.json({ ok: true, ...result }, { status: result.intake === "accepted" ? 201 : 200 });
  } catch (error) {
    const message = error instanceof Error && !error.message.includes("https:") ? error.message : "warlock_intake_failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
