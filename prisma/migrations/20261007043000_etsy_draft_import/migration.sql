CREATE TABLE "SpellmarkDraftImportPreview" (
  "id" TEXT NOT NULL,
  "bodyJson" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "appliedProductId" TEXT,
  "resultJson" TEXT,
  CONSTRAINT "SpellmarkDraftImportPreview_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SpellmarkDraftImportPreview_expiresAt_idx" ON "SpellmarkDraftImportPreview"("expiresAt");
