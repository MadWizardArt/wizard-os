ALTER TABLE "SpellmarkProduct"
ADD COLUMN "keepInWarlock" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "assetsPurgedAt" TIMESTAMP(3);
