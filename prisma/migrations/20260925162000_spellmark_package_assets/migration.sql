CREATE TABLE "SpellmarkAsset" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'other',
  "fileName" TEXT NOT NULL,
  "blobUrl" TEXT NOT NULL,
  "pathname" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "byteSize" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SpellmarkAsset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SpellmarkAsset_blobUrl_key" ON "SpellmarkAsset"("blobUrl");
CREATE INDEX "SpellmarkAsset_productId_role_idx" ON "SpellmarkAsset"("productId", "role");

ALTER TABLE "SpellmarkAsset"
ADD CONSTRAINT "SpellmarkAsset_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "SpellmarkProduct"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
