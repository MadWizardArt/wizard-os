-- Preserve the location of existing images, including recently moved older images.
-- Favorites and subsequent metadata edits must not influence gallery placement.
ALTER TABLE "GrottoImage" ADD COLUMN "galleryAddedAt" TIMESTAMP(3);
UPDATE "GrottoImage" SET "galleryAddedAt" = "updatedAt";
ALTER TABLE "GrottoImage" ALTER COLUMN "galleryAddedAt" SET NOT NULL;
ALTER TABLE "GrottoImage" ALTER COLUMN "galleryAddedAt" SET DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX "GrottoImage_museId_deletedAt_galleryAddedAt_idx" ON "GrottoImage"("museId", "deletedAt", "galleryAddedAt");
