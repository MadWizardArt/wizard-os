import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";
import { verifyArtistSession } from "../../../../../lib/museum-artist-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as HandleUploadBody;
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!verifyArtistSession(request)) throw new Error("Artist session required.");
        if (request.headers.get("origin") !== request.nextUrl.origin) throw new Error("Same-origin upload required.");
        if (!/^grotto\/studio\/references\/[a-f0-9-]{36}-[a-zA-Z0-9._-]{1,180}$/.test(pathname)) throw new Error("Invalid reference file name.");
        return {
          allowedContentTypes: ["image/jpeg", "image/png", "image/webp"],
          maximumSizeInBytes: 10 * 1024 * 1024,
          addRandomSuffix: true,
        };
      },
      onUploadCompleted: async () => {
        // Registration is finalized by the authenticated browser request.
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Reference upload failed." }, { status: 400 });
  }
}
