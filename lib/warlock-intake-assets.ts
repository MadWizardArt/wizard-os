import { createHash } from "node:crypto";
import { put, get, head, del } from "@vercel/blob";
import type { IntakeInput } from "./warlock-intake-schema.ts";
export type IntakeAsset = NonNullable<IntakeInput["assets"]>[number];
const MAX_BYTES = 20 * 1024 * 1024;
export function permittedIntakeUrl(raw: string) {
  const url = new URL(raw);
  const host = url.hostname.toLowerCase();
  const additional = (process.env.WARLOCK_INTAKE_ASSET_HOSTS ?? "").split(",").map(v => v.trim().toLowerCase()).filter(Boolean);
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") ||
    !((host === "chatgpt.com" && url.pathname.startsWith("/backend-api/files/")) || host.endsWith(".oaiusercontent.com") || /^oai(?:sdmnt|sdsor)pr[a-z0-9]*\.blob\.core\.windows\.net$/.test(host) || /^sdmntpr[a-z0-9]*\.blob\.core\.windows\.net$/.test(host) || /^oaisdmntpr[a-z0-9]*aws\.s3\.[a-z0-9.-]+\.amazonaws\.com$/.test(host) || additional.includes(host))) {
    throw new Error("asset_source_not_allowed: Supply an existing Warlock assetId, native ChatGPT files with assets.fileId, base64 bytes, or an approved HTTPS download URL.");
  }
  return url;
}
export async function readIntakeBytes(asset: IntakeAsset) {
  let bytes: Buffer; let contentType = asset.contentType ?? "application/octet-stream";
  if (asset.base64 !== undefined) {
    if (!asset.base64 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(asset.base64)) throw new Error("asset_base64_invalid");
    bytes = Buffer.from(asset.base64, "base64");
  } else {
    let url = permittedIntakeUrl(asset.url!);
    const signal = AbortSignal.timeout(20000);
    let response: Response | undefined;
    for (let redirects = 0; redirects <= 3; redirects++) {
      response = await fetch(url, { redirect: "manual", signal, cache: "no-store" });
      if (![301,302,303,307,308].includes(response.status)) break;
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location || redirects === 3) throw new Error("asset_redirect_invalid");
      url = permittedIntakeUrl(new URL(location, url).href);
    }
    if (!response?.ok || !response.body) throw new Error("asset_download_failed");
    const reader = response.body.getReader(); const chunks: Buffer[] = []; let size = 0;
    try { while (true) { const result = await reader.read(); if (result.done) break; size += result.value.length; if (size > MAX_BYTES) throw new Error("asset_too_large"); chunks.push(Buffer.from(result.value)); } }
    finally { await reader.cancel(); }
    bytes = Buffer.concat(chunks);
    contentType = response.headers.get("content-type")?.split(";")[0] ?? contentType;
  }
  if (!bytes.length || bytes.length > MAX_BYTES) throw new Error("asset_size_invalid");
  // Use file signatures for uploadable images rather than trusting the remote MIME label.
  if (bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) contentType = "image/png";
  else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) contentType = "image/jpeg";
  else if (bytes.subarray(0,4).toString() === "RIFF" && bytes.subarray(8,12).toString() === "WEBP") contentType = "image/webp";
  else if (bytes.subarray(0,4).toString() === "%PDF") contentType = "application/pdf";
  else if (bytes[0] === 80 && bytes[1] === 75) contentType = "application/zip";
  else throw new Error("asset_file_type_unsupported");
  if (["hero", "mockup", "master"].includes(asset.role) && !contentType.startsWith("image/")) throw new Error("asset_image_required");
  if (!asset.name || !/^[A-Za-z0-9._-]+$/.test(asset.name)) throw new Error("asset_name_required: Use a filename containing letters, numbers, periods, underscores, or hyphens.");
  return { bytes, contentType, digest: createHash("sha256").update(bytes).digest("hex") };
}
export async function materializeIntakeAsset(productId: string, asset: IntakeAsset, data: Awaited<ReturnType<typeof readIntakeBytes>>) {
  const pathname = `warlock/${productId}/intake/${asset.role}/${data.digest}/${asset.name}`;
  const blob = await put(pathname, data.bytes, { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: data.contentType });
  return { role: asset.role, fileName: asset.name!, blobUrl: blob.url, pathname: blob.pathname, contentType: data.contentType, byteSize: data.bytes.length };
}
export async function verifyIntakeAsset(asset: { blobUrl: string; pathname: string; productId: string; byteSize: number }) {
  if (!asset.pathname.startsWith(`warlock/${asset.productId}/`)) throw new Error("asset_path_not_owned");
  const metadata = await head(asset.blobUrl);
  if (metadata.pathname !== asset.pathname || metadata.size !== asset.byteSize || metadata.size <= 0) throw new Error("asset_blob_metadata_mismatch");
  const result = await get(asset.blobUrl, { access: "private" });
  if (!result || result.statusCode !== 200) throw new Error("asset_private_blob_missing");
  await result.stream.cancel();
}

export async function discardIntakeBlob(url: string) { await del(url); }
