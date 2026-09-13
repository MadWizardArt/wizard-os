-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "artworkSaleId" TEXT;

-- AlterTable
ALTER TABLE "Painting" ADD COLUMN     "framingCostCents" INTEGER,
ADD COLUMN     "materialsCostCents" INTEGER;

-- CreateTable
CREATE TABLE "ArtworkSale" (
    "campaignId" TEXT,
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "saleDate" TEXT NOT NULL,
    "salePriceCents" INTEGER NOT NULL,
    "discountCents" INTEGER NOT NULL DEFAULT 0,
    "salesTaxCents" INTEGER NOT NULL DEFAULT 0,
    "shippingIncomeCents" INTEGER NOT NULL DEFAULT 0,
    "sellingFeesCents" INTEGER,
    "shippingExpenseCents" INTEGER,
    "fulfillment" TEXT NOT NULL DEFAULT 'Awaiting shipment',
    "status" TEXT NOT NULL DEFAULT 'Active',
    "notes" TEXT NOT NULL DEFAULT '',
    "requestKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArtworkSale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArtworkHistory" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArtworkHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ArtworkSale_requestKey_key" ON "ArtworkSale"("requestKey");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_artworkSaleId_fkey" FOREIGN KEY ("artworkSaleId") REFERENCES "ArtworkSale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArtworkSale" ADD CONSTRAINT "ArtworkSale_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArtworkSale" ADD CONSTRAINT "ArtworkSale_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Painting"("projectId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArtworkHistory" ADD CONSTRAINT "ArtworkHistory_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Painting"("projectId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "ArtworkSale_one_active_per_painting" ON "ArtworkSale" ("projectId") WHERE "status" = 'Active';
ALTER TABLE "ArtworkSale" ADD CONSTRAINT "ArtworkSale_values" CHECK ("salePriceCents">=0 AND "discountCents">=0 AND "salesTaxCents">=0 AND "shippingIncomeCents">=0 AND ("sellingFeesCents" IS NULL OR "sellingFeesCents">=0) AND ("shippingExpenseCents" IS NULL OR "shippingExpenseCents">=0));
ALTER TABLE "ArtworkSale" ADD CONSTRAINT "ArtworkSale_status" CHECK ("status" IN ('Active','Returned','Voided'));
ALTER TABLE "Painting" ADD CONSTRAINT "Painting_costs" CHECK (("materialsCostCents" IS NULL OR "materialsCostCents">=0) AND ("framingCostCents" IS NULL OR "framingCostCents">=0));
