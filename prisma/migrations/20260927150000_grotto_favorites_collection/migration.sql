-- Favorites are the retention signal; Muse remains generation provenance only.
DROP INDEX IF EXISTS "GrottoImage_museId_deletedAt_galleryAddedAt_idx";
ALTER TABLE "GrottoImage" DROP COLUMN IF EXISTS "galleryAddedAt";
CREATE INDEX "GrottoImage_favorite_deletedAt_createdAt_idx" ON "GrottoImage"("favorite", "deletedAt", "createdAt");
