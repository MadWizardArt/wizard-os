import { NextRequest, NextResponse } from "next/server";
import { grottoStudioStatus } from "../../../../lib/grotto-civitai";
import { artistAccessConfigured, verifyArtistSession } from "../../../../lib/museum-artist-auth";
import { MAX_GROTTO_LORAS } from "../../../../lib/grotto-loras";
import { grottoBlobConfigured } from "../../../../lib/grotto-blob";
import { grottoCapacity, MAX_GROTTO_IMAGES } from "../../../../lib/grotto-capacity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authenticated = verifyArtistSession(request);
  const studio = grottoStudioStatus();
  const collection = authenticated ? await grottoCapacity() : { count: 0, limit: MAX_GROTTO_IMAGES, remaining: MAX_GROTTO_IMAGES, full: false };

  return NextResponse.json({
    configured: artistAccessConfigured(),
    authenticated,
    storage: { provider: "vercel-blob", configured: grottoBlobConfigured() },
    collection,
    studio: authenticated ? studio : {
      enabled: false,
      provider: "civitai",
      providerConfigured: false,
      checkpointConfigured: false,
      checkpointLabel: "",
      configured: false,
      defaultEnvironmentId: "pony-v6",
      defaultPrompts: {},
      defaultNegativePrompts: {},
      environments: [],
      loras: [],
      maxLoras: MAX_GROTTO_LORAS,
      defaultNegative: "",
      maxImages: 1,
    },
  });
}
