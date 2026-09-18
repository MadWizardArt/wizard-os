import { randomUUID } from "node:crypto";
import { del, get, put } from "@vercel/blob";

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

export async function readGrottoImage(blobUrl: string) {
  return get(blobUrl, { access: "private" });
}

export async function deleteGrottoImages(blobUrls: Array<string | null | undefined>) {
  const urls = [...new Set(blobUrls.filter((url): url is string => Boolean(url)))];
  if (!urls.length || !grottoBlobConfigured()) return;
  await del(urls);
}
