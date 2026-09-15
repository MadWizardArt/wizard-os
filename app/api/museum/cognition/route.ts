import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { isMuseId } from "../../../../lib/museum";
import { readSharedCouncilCognition } from "../../../../lib/museum-agent-cognition";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const museParam = request.nextUrl.searchParams.get("muse");
  if (!museParam || !isMuseId(museParam)) {
    return NextResponse.json({ error: "Choose a valid Muse for shared Council cognition." }, { status: 400 });
  }

  const cognition = await readSharedCouncilCognition(prisma, museParam);
  return NextResponse.json(cognition);
}
