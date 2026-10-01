import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("database_health_timeout")), 2500);
      }),
    ]);
    return NextResponse.json(
      { ok: true, app: "Wizard OS", version: "0.1.0", checks: { database: "reachable" } },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Wizard OS health check failed", error);
    return NextResponse.json(
      { ok: false, app: "Wizard OS", version: "0.1.0", checks: { database: "unreachable" } },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
