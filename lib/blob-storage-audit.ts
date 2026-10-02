import { list, type ListBlobResultBlob } from "@vercel/blob";
import type { PrismaClient } from "../app/generated/prisma/client";

type Summary = { count: number; bytes: number };
type Bucket = Summary & { orphaned: Summary };

function summarize(blobs: Array<{ size: number }>): Summary {
  return {
    count: blobs.length,
    bytes: blobs.reduce((sum, blob) => sum + Number(blob.size || 0), 0),
  };
}

async function listAllBlobs() {
  const blobs: ListBlobResultBlob[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ cursor, limit: 1000 });
    blobs.push(...page.blobs);
    cursor = page.cursor;
  } while (cursor);
  return blobs;
}

export async function auditBlobStorage(db: PrismaClient) {
  const [blobs, grottoRows, warlockRows, paintings] = await Promise.all([
    listAllBlobs(),
    db.grottoImage.findMany({
      where: { blobUrl: { not: null } },
      select: { blobUrl: true },
    }),
    db.spellmarkAsset.findMany({
      select: { blobUrl: true, pathname: true },
    }),
    db.painting.findMany({
      where: { thumbnail: { not: "" } },
      select: { thumbnail: true },
    }),
  ]);

  const grottoUrls = new Set(grottoRows.flatMap((row) => row.blobUrl ? [row.blobUrl] : []));
  const warlockUrls = new Set(warlockRows.map((row) => row.blobUrl));
  const warlockPaths = new Set(warlockRows.map((row) => row.pathname));
  const artworkUrls = new Set(paintings.map((row) => row.thumbnail));

  const namespace = (prefix: string) => blobs.filter((blob) => blob.pathname.startsWith(prefix));
  const classify = (
    subset: ListBlobResultBlob[],
    owned: (blob: ListBlobResultBlob) => boolean,
  ): Bucket => {
    const orphaned = subset.filter((blob) => !owned(blob));
    return { ...summarize(subset), orphaned: summarize(orphaned) };
  };

  const grotto = namespace("grotto/");
  const warlock = namespace("warlock/");
  const artwork = namespace("artwork/");
  const known = new Set([...grotto, ...warlock, ...artwork].map((blob) => blob.url));
  const other = blobs.filter((blob) => !known.has(blob.url));

  return {
    total: summarize(blobs),
    grotto: classify(grotto, (blob) => grottoUrls.has(blob.url)),
    warlock: classify(warlock, (blob) => warlockUrls.has(blob.url) || warlockPaths.has(blob.pathname)),
    artwork: classify(artwork, (blob) => artworkUrls.has(blob.url)),
    other: {
      ...summarize(other),
      objects: other.map((blob) => ({
        pathname: blob.pathname,
        size: Number(blob.size || 0),
      })),
    },
  };
}
