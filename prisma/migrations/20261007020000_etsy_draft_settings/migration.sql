ALTER TABLE "SpellmarkListing"
  ADD COLUMN "shopSectionId" TEXT,
  ADD COLUMN "productionPartnerId" TEXT,
  ADD COLUMN "digitalContentCreationType" TEXT,
  ADD COLUMN "etsyAdsEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "etsyConfigurationEvidenceJson" TEXT,
  ADD COLUMN "etsyDraftSettingsVerificationJson" TEXT;
-- Existing listings require explicit live configuration; do not invent mutable IDs.
