import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import {
  campaignAdvanceLabels,
  campaignStatusDescriptions,
  isCampaignStatus,
  nextCampaignStatus,
} from "../../../../lib/campaign-rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === request.nextUrl.host;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json(
      { error: "Cross-origin campaign progression is not accepted." },
      { status: 403 },
    );
  }

  try {
    const body = await request.json();
    const id = typeof body.id === "string" ? body.id.trim().slice(0, 120) : "";
    if (!id || body.action !== "advance") {
      return NextResponse.json(
        { error: "Choose a campaign to advance." },
        { status: 400 },
      );
    }

    const campaign = await prisma.campaign.findUnique({
      where: { id },
      select: { id: true, title: true, status: true },
    });
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    }
    if (!isCampaignStatus(campaign.status)) {
      return NextResponse.json(
        { error: `Campaign has an unsupported status: ${campaign.status}. Use Edit campaign to correct it first.` },
        { status: 409 },
      );
    }

    const nextStatus = nextCampaignStatus(campaign.status);
    if (!nextStatus) {
      return NextResponse.json(
        { error: "This campaign is already closed." },
        { status: 409 },
      );
    }

    const updated = await prisma.campaign.updateMany({
      where: { id: campaign.id, status: campaign.status },
      data: { status: nextStatus },
    });
    if (updated.count !== 1) {
      return NextResponse.json(
        { error: "Campaign status changed while advancing. Refresh and try again." },
        { status: 409 },
      );
    }

    return NextResponse.json({
      ok: true,
      id: campaign.id,
      title: campaign.title,
      fromStatus: campaign.status,
      status: nextStatus,
      nextAction: campaignAdvanceLabels[nextStatus] ?? null,
      description: campaignStatusDescriptions[nextStatus],
    });
  } catch (error) {
    console.error("Campaign progression failed", error);
    return NextResponse.json(
      { error: "Campaign could not be advanced. Refresh and try again." },
      { status: 500 },
    );
  }
}
