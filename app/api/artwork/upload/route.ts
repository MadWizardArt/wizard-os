import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedContentTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
];

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
      { error: "Cross-origin painting uploads are not accepted." },
      { status: 403 },
    );
  }

  try {
    const body = (await request.json()) as HandleUploadBody;
    const response = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith("artwork/paintings/")) {
          throw new Error("Invalid painting image path.");
        }
        console.info("[artwork/upload] token issued", { pathname });
        return {
          allowedContentTypes,
          maximumSizeInBytes: 10 * 1024 * 1024,
          addRandomSuffix: true,
        };
      },
      onUploadCompleted: async ({ blob }) => {
        console.info("[artwork/upload] completed", {
          pathname: blob.pathname,
          contentType: blob.contentType,
          url: blob.url,
        });
      },
    });
    return NextResponse.json(response);
  } catch (error) {
    console.error("[artwork/upload] failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Painting image upload failed.",
      },
      { status: 400 },
    );
  }
}
