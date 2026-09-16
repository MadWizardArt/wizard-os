import { NextRequest, NextResponse } from "next/server";
import { grottoGenerationStatus } from "../../../../lib/grotto-civitai";
import { artistAccessConfigured, verifyArtistSession } from "../../../../lib/museum-artist-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authenticated = verifyArtistSession(request);
  const generation = grottoGenerationStatus();

  return NextResponse.json({
    configured: artistAccessConfigured(),
    authenticated,
    generation: authenticated
      ? generation
      : {
          enabled: false,
          provider: "civitai",
          providerConfigured: false,
          museModelConfigured: false,
          configured: false,
        },
  });
}
