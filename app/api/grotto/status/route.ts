import { NextRequest, NextResponse } from "next/server";
import { grottoStudioStatus } from "../../../../lib/grotto-civitai";
import { artistAccessConfigured, verifyArtistSession } from "../../../../lib/museum-artist-auth";
import { MAX_GROTTO_LORAS } from "../../../../lib/grotto-loras";
import { grottoBlobConfigured } from "../../../../lib/grotto-blob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authenticated = verifyArtistSession(request);
  const studio = grottoStudioStatus();

  return NextResponse.json({
    configured: artistAccessConfigured(),
    authenticated,
    storage: { provider: "vercel-blob", configured: grottoBlobConfigured() },
    studio: authenticated ? studio : {
      enabled: false,
      provider: "civitai",
      providerConfigured: false,
      checkpointConfigured: false,
      checkpointLabel: "",
      configured: false,
      defaultEnvironmentId: "pony-v6",
      environments: [],
      loras: [],
      maxLoras: MAX_GROTTO_LORAS,
      defaultNegative: "",
      maxImages: 1,
    },
  });
}
