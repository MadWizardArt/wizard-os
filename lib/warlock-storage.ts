import { del, list, type ListBlobResultBlob } from "@vercel/blob";
import type { PrismaClient } from "../app/generated/prisma/client";

type BlobSummary = {
  count: number;
  bytes: number;
};

export type WarlockBlobAudit = {
  scanned: BlobSummary;
  canonical: BlobSummary;
  orphaned: BlobSummary;
  orphanUrls: string[];
};

async function listPrefix(prefix: string) {
  const blobs: ListBlobResultBlob[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix, cursor, limit: 1000 });
    blobs.push(...page.blobs);
    cursor = page.cursor;
  } while (cursor);
  return blobs;
}

function summary(blobs: Array<{ size: number }>): BlobSummary {
  return {
    count: blobs.length,
    bytes: blobs.reduce((total, blob) => total + Number(blob.size || 0), 0),
  };
}

export async function auditWarlockBlobStorage(db: PrismaClient): Promise<WarlockBlobAudit> {
  const [blobs, assets] = await Promise.all([
    listPrefix("warlock/"),
    db.spellmarkAsset.findMany({ select: { blobUrl: true, pathname: true, byteSize: true } }),
  ]);

  const canonicalUrls = new Set(assets.map((asset) => asset.blobUrl));
  const canonicalPaths = new Set(assets.map((asset) => asset.pathname));
  const canonical = blobs.filter((blob) => canonicalUrls.has(blob.url) || canonicalPaths.has(blob.pathname));
  const orphaned = blobs.filter((blob) => !canonicalUrls.has(blob.url) && !canonicalPaths.has(blob.pathname));

  return {
    scanned: summary(blobs),
    canonical: summary(canonical),
    orphaned: summary(orphaned),
    orphanUrls: orphaned.map((blob) => blob.url),
  };
}

export async function deleteVerifiedWarlockOrphans(
  db: PrismaClient,
  expected: { count: number; bytes: number },
) {
  const audit = await auditWarlockBlobStorage(db);
  if (audit.orphaned.count !== expected.count || audit.orphaned.bytes !== expected.bytes) {
    throw new Error("warlock_orphan_set_changed");
  }
  if (!audit.orphanUrls.length) return audit;

  for (let index = 0; index < audit.orphanUrls.length; index += 100) {
    await del(audit.orphanUrls.slice(index, index + 100));
  }

  return auditWarlockBlobStorage(db);
}
