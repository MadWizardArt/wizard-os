-- Warlock Commerce v5: persist idempotency identifiers for draft execution and Printful sync.
ALTER TABLE "SpellmarkVariant"
  ADD COLUMN "etsySku" TEXT,
  ADD COLUMN "etsyProductId" TEXT,
  ADD COLUMN "printfulSyncVariantId" INTEGER;

ALTER TABLE "SpellmarkListing"
  ADD COLUMN "printfulSyncProductId" INTEGER,
  ADD COLUMN "lastDraftSyncAt" TIMESTAMP(3);

ALTER TABLE "SpellmarkListingAsset"
  ADD COLUMN "etsyRemoteId" TEXT,
  ADD COLUMN "etsySyncedAt" TIMESTAMP(3);

CREATE INDEX "SpellmarkVariant_etsyProductId_idx" ON "SpellmarkVariant"("etsyProductId");
CREATE INDEX "SpellmarkVariant_printfulSyncVariantId_idx" ON "SpellmarkVariant"("printfulSyncVariantId");
CREATE INDEX "SpellmarkListing_printfulSyncProductId_idx" ON "SpellmarkListing"("printfulSyncProductId");

-- Preserve the established Volans SKU mapping from the legacy one-off release route.
UPDATE "SpellmarkVariant" SET "etsySku" = 'SM-OWL-P1-V4463'
WHERE "id" = 'spellmarkowlunframed8x10v1';

UPDATE "SpellmarkVariant" SET "etsySku" = 'SM-OWL-P1-V14125'
WHERE "id" = 'spellmarkowlunframedv1';

UPDATE "SpellmarkVariant" SET "etsySku" = 'SM-OWL-P2-V14292'
WHERE "id" = 'spellmarkowlframedv1';


-- Reuse the existing approved package assets without inventing new files.
-- Physical: hero + all physical/listing mockups.
WITH ranked AS (
  SELECT
    a."id" AS "assetId",
    ROW_NUMBER() OVER (
      ORDER BY CASE WHEN a."role" = 'hero' THEN 0 ELSE 1 END, a."createdAt", a."id"
    )::INTEGER AS "position"
  FROM "SpellmarkAsset" a
  WHERE a."productId" = 'spellmarkowlvolansv1'
    AND a."role" IN ('hero','mockup')
)
INSERT INTO "SpellmarkListingAsset" (
  "id","listingId","assetId","kind","position","createdAt"
)
SELECT
  'volansphysical-' || ranked."assetId",
  'spellmarkvolansphysicalv1',
  ranked."assetId",
  'image',
  ranked."position",
  CURRENT_TIMESTAMP
FROM ranked
ON CONFLICT DO NOTHING;

-- Digital: listing hero imagery only; physical mockups are intentionally excluded.
WITH ranked AS (
  SELECT
    a."id" AS "assetId",
    ROW_NUMBER() OVER (ORDER BY a."createdAt", a."id")::INTEGER AS "position"
  FROM "SpellmarkAsset" a
  WHERE a."productId" = 'spellmarkowlvolansv1'
    AND a."role" = 'hero'
)
INSERT INTO "SpellmarkListingAsset" (
  "id","listingId","assetId","kind","position","createdAt"
)
SELECT
  'volansdigitalimage-' || ranked."assetId",
  'spellmarkvolansdigitalv1',
  ranked."assetId",
  'image',
  ranked."position",
  CURRENT_TIMESTAMP
FROM ranked
ON CONFLICT DO NOTHING;

WITH ranked AS (
  SELECT
    a."id" AS "assetId",
    ROW_NUMBER() OVER (ORDER BY a."createdAt", a."id")::INTEGER AS "position"
  FROM "SpellmarkAsset" a
  WHERE a."productId" = 'spellmarkowlvolansv1'
    AND a."role" = 'customer_file'
)
INSERT INTO "SpellmarkListingAsset" (
  "id","listingId","assetId","kind","position","createdAt"
)
SELECT
  'volansdigitalfile-' || ranked."assetId",
  'spellmarkvolansdigitalv1',
  ranked."assetId",
  'customer_file',
  ranked."position",
  CURRENT_TIMESTAMP
FROM ranked
ON CONFLICT DO NOTHING;
