import { NextRequest, NextResponse } from "next/server";
import { grottoGenerationStatus, grottoStudioStatus } from "../../../../lib/grotto-civitai";
import { artistAccessConfigured, verifyArtistSession } from "../../../../lib/museum-artist-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authenticated = verifyArtistSession(request);
  const generation = grottoGenerationStatus();
  const studio = grottoStudioStatus();

  return NextResponse.json({
    configured: artistAccessConfigured(),
    authenticated,
    generation: authenticated ? generation : {
      enabled: false,
      provider: "civitai",
      providerConfigured: false,
      museModelConfigured: false,
      configured: false,
    },
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
      maxLoras: 2,
      defaultNegative: "",
      maxImages: 1,
    },
  });
}
