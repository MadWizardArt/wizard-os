import { head } from "@vercel/blob";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";
import { verifyArtistSession } from "../../../../../lib/museum-artist-auth";
import { prisma } from "../../../../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLES = new Set(["hero", "mockup", "customer_file", "master", "other"]);
const allowedContentTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/zip",
  "application/x-zip-compressed",
  "application/octet-stream",
];

function safeName(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/[\\/\u0000-\u001f]+/g, "_").slice(0, 240);
}

export async function POST(request: NextRequest) {
  if (!verifyArtistSession(request)) {
    return NextResponse.json({ error: "artist_session_required" }, { status: 401 });
  }

  const body = (await request.json()) as HandleUploadBody;
  try {
    const response = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const payload = JSON.parse(clientPayload || "{}") as {
          productId?: string;
          role?: string;
          fileName?: string;
        };
        const productId = typeof payload.productId === "string" ? payload.productId : "";
        const role = ROLES.has(String(payload.role)) ? String(payload.role) : "other";
        const fileName = safeName(payload.fileName);

        if (!/^[a-z0-9]{15,40}$/.test(productId) || !fileName) {
          throw new Error("invalid_asset_metadata");
        }
        const product = await prisma.spellmarkProduct.findUnique({
          where: { id: productId },
          select: { id: true },
        });
        if (!product) throw new Error("product_not_found");
        if (!pathname.startsWith(`warlock/${productId}/`)) {
          throw new Error("invalid_asset_path");
        }

        return {
          allowedContentTypes,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ productId, role, fileName }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const payload = JSON.parse(tokenPayload || "{}") as {
          productId: string;
          role: string;
          fileName: string;
        };
        const info = await head(blob.url);
        await prisma.spellmarkAsset.upsert({
          where: { blobUrl: blob.url },
          create: {
            productId: payload.productId,
            role: payload.role,
            fileName: payload.fileName,
            blobUrl: blob.url,
            pathname: blob.pathname,
            contentType: blob.contentType || info.contentType || "application/octet-stream",
            byteSize: Number(info.size || 0),
          },
          update: {
            role: payload.role,
            fileName: payload.fileName,
            pathname: blob.pathname,
            contentType: blob.contentType || info.contentType || "application/octet-stream",
            byteSize: Number(info.size || 0),
          },
        });
      },
    });
    return NextResponse.json(response);
  } catch (error) {
    console.error("Warlock package upload failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "package_upload_failed" },
      { status: 400 },
    );
  }
}
