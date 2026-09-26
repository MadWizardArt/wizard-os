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
