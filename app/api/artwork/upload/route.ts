import { put } from "@vercel/blob";
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedContentTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]);

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
    const form = await request.formData();
    const image = form.get("image");
    if (!(image instanceof File)) throw new Error("Choose a painting image.");
    if (!allowedContentTypes.has(image.type)) {
      throw new Error("Use a JPG, PNG, WebP, GIF, or AVIF image.");
    }
    if (image.size <= 0 || image.size > 3 * 1024 * 1024) {
      throw new Error("The prepared painting image must be under 3 MB.");
    }
    const safeName = image.name
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "painting-image";
    console.info("[artwork/upload] server upload started", {
      fileName: safeName,
      byteSize: image.size,
      contentType: image.type,
    });
    const blob = await put(
      `artwork/paintings/${randomUUID()}-${safeName}`,
      image,
      {
        access: "public",
        addRandomSuffix: true,
        contentType: image.type,
      },
    );
    console.info("[artwork/upload] server upload completed", {
      pathname: blob.pathname,
      url: blob.url,
    });
    return NextResponse.json({ url: blob.url });
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
