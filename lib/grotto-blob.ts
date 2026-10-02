import { randomUUID } from "node:crypto";
import { del, get, head, put } from "@vercel/blob";

const EXTENSIONS: Record<string, string> = {
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function grottoBlobConfigured() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || (process.env.VERCEL_OIDC_TOKEN && process.env.BLOB_STORE_ID));
}

export async function storeGrottoImage(museId: string, bytes: Buffer, contentType: string) {
  if (!grottoBlobConfigured()) throw new Error("Vercel Blob is not configured.");
  const extension = EXTENSIONS[contentType] || "bin";
  return put(`grotto/${museId}/${randomUUID()}.${extension}`, bytes, {
    access: "private",
    addRandomSuffix: false,
    contentType,
  });
}

export async function migrateGrottoImage(id: string, museId: string, bytes: Buffer, contentType: string) {
  if (!grottoBlobConfigured()) throw new Error("Vercel Blob is not configured.");
  const extension = EXTENSIONS[contentType] || "bin";
  const safeMuseId = museId.toLowerCase().replace(/[^a-z0-9_-]+/g, "-") || "unknown";
  return put(`grotto/${safeMuseId}/${id}.${extension}`, bytes, {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType,
  });
}

export async function readGrottoImage(blobUrl: string) {
  return get(blobUrl, { access: "private" });
}

export async function inspectGrottoImage(blobUrl: string) {
  return head(blobUrl);
}

export async function deleteGrottoImages(blobUrls: Array<string | null | undefined>) {
  const urls = [...new Set(blobUrls.filter((url): url is string => Boolean(url)))];
  if (!urls.length || !grottoBlobConfigured()) return;

  const batchSize = 100;
  for (let offset = 0; offset < urls.length; offset += batchSize) {
    const batch = urls.slice(offset, offset + batchSize);
    let lastError: unknown;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        await del(batch);
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error;
        if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
      }
    }
    if (lastError) throw lastError;
  }
}
