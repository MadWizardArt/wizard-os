-- Sync IDs are opaque external identifiers, not catalog IDs or arithmetic values.
-- Preserve every existing value, null and index while removing the int32 limit.
ALTER TABLE "SpellmarkVariant"
  ALTER COLUMN "printfulSyncVariantId" TYPE TEXT USING "printfulSyncVariantId"::TEXT;
ALTER TABLE "SpellmarkListing"
  ALTER COLUMN "printfulSyncProductId" TYPE TEXT USING "printfulSyncProductId"::TEXT;
