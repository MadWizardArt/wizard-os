import { head, put } from "@vercel/blob";
import pg from "pg";

const { Pool } = pg;
const EXTENSIONS = new Map([
  ["image/gif", "gif"],
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

function readNumberFlag(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  const value = Number(process.argv[index + 1]);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive integer.`);
  return value;
}

const cleanup = process.argv.includes("--cleanup");
const confirmed = process.argv.includes("--yes");
const verifyOnly = process.argv.includes("--verify-only");
const batchSize = readNumberFlag("--batch-size", 10);
const limit = readNumberFlag("--limit", Number.MAX_SAFE_INTEGER);
const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DIRECT_URL || process.env.DATABASE_URL;

if (!connectionString) throw new Error("Set DATABASE_URL_UNPOOLED, DIRECT_URL, or DATABASE_URL.");
if (!process.env.BLOB_READ_WRITE_TOKEN && !(process.env.VERCEL_OIDC_TOKEN && process.env.BLOB_STORE_ID)) {
  throw new Error("Vercel Blob credentials are not configured.");
}
if (cleanup && !confirmed) throw new Error("Cleanup is destructive. Re-run with --cleanup --yes after verification succeeds.");

const pool = new Pool({ connectionString, max: 2 });

function pathnameFor(row) {
  const extension = EXTENSIONS.get(row.contentType) || "bin";
  const museId = row.museId.toLowerCase().replace(/[^a-z0-9_-]+/g, "-") || "unknown";
  return `grotto/${museId}/${row.id}.${extension}`;
}

async function verifyRow(row) {
  if (!row.blobUrl) return false;
  const remote = await head(row.blobUrl);
  if (Number(remote.size) !== Number(row.byteSize)) {
    throw new Error(`Size mismatch for ${row.id}: Neon=${row.byteSize}, Blob=${remote.size}`);
  }
  return true;
}

async function status() {
  const result = await pool.query(`
    SELECT
      count(*) FILTER (WHERE "deletedAt" IS NULL) AS total,
      count(*) FILTER (WHERE "deletedAt" IS NULL AND "imageData" IS NOT NULL AND "blobUrl" IS NULL) AS pending,
      count(*) FILTER (WHERE "deletedAt" IS NULL AND "blobUrl" IS NOT NULL) AS copied,
      count(*) FILTER (WHERE "deletedAt" IS NULL AND "imageData" IS NOT NULL) AS legacy
    FROM "GrottoImage"
  `);
  return result.rows[0];
}

async function copyBatch(remainingLimit) {
  const result = await pool.query(`
    SELECT id, "museId", "contentType", "imageData", "byteSize"
    FROM "GrottoImage"
    WHERE "deletedAt" IS NULL AND "imageData" IS NOT NULL AND "blobUrl" IS NULL
    ORDER BY "createdAt" ASC, id ASC
    LIMIT $1
  `, [Math.min(batchSize, remainingLimit)]);

  for (const row of result.rows) {
    const blob = await put(pathnameFor(row), row.imageData, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: row.contentType,
    });
    const remote = await head(blob.url);
    if (Number(remote.size) !== row.imageData.length) throw new Error(`Upload verification failed for ${row.id}.`);
    await pool.query(`
      UPDATE "GrottoImage"
      SET "blobUrl" = $1, "updatedAt" = NOW()
      WHERE id = $2 AND "blobUrl" IS NULL AND "imageData" IS NOT NULL
    `, [blob.url, row.id]);
    console.log(`copied ${row.id} (${row.imageData.length} bytes)`);
  }
  return result.rowCount || 0;
}

async function verifyAndMaybeClean() {
  let cursor = "";
  let verified = 0;
  while (true) {
    const result = await pool.query(`
      SELECT id, "blobUrl", "byteSize"
      FROM "GrottoImage"
      WHERE "deletedAt" IS NULL AND "blobUrl" IS NOT NULL AND "imageData" IS NOT NULL AND id > $1
      ORDER BY id ASC
      LIMIT $2
    `, [cursor, batchSize]);
    if (!result.rowCount) break;
    for (const row of result.rows) {
      await verifyRow(row);
      if (cleanup) {
        await pool.query(`UPDATE "GrottoImage" SET "imageData" = NULL, "updatedAt" = NOW() WHERE id = $1 AND "blobUrl" = $2`, [row.id, row.blobUrl]);
        console.log(`verified and cleaned ${row.id}`);
      } else {
        console.log(`verified ${row.id}`);
      }
      verified += 1;
      cursor = row.id;
    }
  }
  return verified;
}

try {
  console.log("before", await status());
  let copied = 0;
  if (!verifyOnly && !cleanup) {
    while (copied < limit) {
      const count = await copyBatch(limit - copied);
      copied += count;
      if (count === 0) break;
    }
  }
  const current = await status();
  if (cleanup && Number(current.pending) !== 0) throw new Error(`Refusing cleanup: ${current.pending} images have not been copied.`);
  const verified = await verifyAndMaybeClean();
  console.log("complete", { copied, verified, cleanup, status: await status() });
} finally {
  await pool.end();
}
