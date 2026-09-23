-- Warlock 2.0: one Spellmark product may have digital and physical variants.
CREATE TYPE "SpellmarkFulfillment" AS ENUM ('DIGITAL', 'PHYSICAL');

CREATE TABLE "SpellmarkProduct" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "collection" TEXT NOT NULL DEFAULT '',
  "description" TEXT NOT NULL DEFAULT '',
  "artworkReference" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'DESIGN',
  "notes" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SpellmarkProduct_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SpellmarkVariant" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "fulfillment" "SpellmarkFulfillment" NOT NULL,
  "label" TEXT NOT NULL,
  "printfulProductId" INTEGER,
  "printfulVariantId" INTEGER,
  "etsyListingId" TEXT,
  "retailPriceCents" INTEGER,
  "productionBaseCents" INTEGER,
  "productionQuotedAt" TIMESTAMP(3),
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SpellmarkVariant_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SpellmarkProduct_collection_status_idx" ON "SpellmarkProduct"("collection", "status");
CREATE INDEX "SpellmarkVariant_productId_fulfillment_idx" ON "SpellmarkVariant"("productId", "fulfillment");
CREATE INDEX "SpellmarkVariant_printfulVariantId_idx" ON "SpellmarkVariant"("printfulVariantId");
CREATE INDEX "SpellmarkVariant_etsyListingId_idx" ON "SpellmarkVariant"("etsyListingId");
ALTER TABLE "SpellmarkVariant" ADD CONSTRAINT "SpellmarkVariant_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "SpellmarkProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;
