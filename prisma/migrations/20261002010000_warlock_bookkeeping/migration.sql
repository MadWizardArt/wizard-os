ALTER TABLE "SpellmarkListing" ADD COLUMN "digitalDelivery" TEXT NOT NULL DEFAULT 'INSTANT_DOWNLOAD', ADD COLUMN "lastVerifiedAt" TIMESTAMP(3), ADD COLUMN "observationJson" TEXT;
UPDATE "SpellmarkListing" SET "digitalDelivery" = 'MADE_TO_ORDER' WHERE "fulfillment" = 'DIGITAL' AND "whenMade" = 'made_to_order';
CREATE TABLE "SpellmarkJournal" (
  "id" TEXT NOT NULL, "productId" TEXT NOT NULL, "requestId" TEXT NOT NULL,
  "kind" TEXT NOT NULL, "bodyJson" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SpellmarkJournal_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SpellmarkJournal_productId_requestId_key" ON "SpellmarkJournal"("productId", "requestId");
CREATE INDEX "SpellmarkJournal_productId_createdAt_idx" ON "SpellmarkJournal"("productId", "createdAt");
ALTER TABLE "SpellmarkJournal" ADD CONSTRAINT "SpellmarkJournal_productId_fkey" FOREIGN KEY ("productId") REFERENCES "SpellmarkProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;
