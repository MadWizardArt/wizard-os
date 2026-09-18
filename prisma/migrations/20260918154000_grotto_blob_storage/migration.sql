ALTER TABLE "GrottoImage"
  ALTER COLUMN "imageData" DROP NOT NULL,
  ADD COLUMN "blobUrl" TEXT;

CREATE UNIQUE INDEX "GrottoImage_blobUrl_key" ON "GrottoImage"("blobUrl");
