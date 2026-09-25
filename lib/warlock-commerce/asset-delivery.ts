import { issueSignedToken, presignUrl } from "@vercel/blob";
import type { WarlockManifestAsset } from "../warlock-mcp/manifest.ts";

const DEFAULT_TTL_MS = 15 * 60 * 1000;
const MAX_TTL_MS = 60 * 60 * 1000;

export type TemporaryAssetUrl = {
  assetId: string;
  fileName: string;
  url: string;
  expiresAt: string;
};

export async function createTemporaryPrintfulAssetUrl(
  asset: WarlockManifestAsset,
  ttlMs = DEFAULT_TTL_MS,
): Promise<TemporaryAssetUrl> {
  const boundedTtl = Math.max(60_000, Math.min(ttlMs, MAX_TTL_MS));
  const validUntil = Date.now() + boundedTtl;
  const token = await issueSignedToken({
    pathname: asset.pathname,
    operations: ["get"],
    validUntil,
  });
  const { presignedUrl } = await presignUrl(token, {
    operation: "get",
    pathname: asset.pathname,
    access: "private",
    validUntil,
    useCache: false,
  });

  return {
    assetId: asset.id,
    fileName: asset.fileName,
    url: presignedUrl,
    expiresAt: new Date(validUntil).toISOString(),
  };
}
