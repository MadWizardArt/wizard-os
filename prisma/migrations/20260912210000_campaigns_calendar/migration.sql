-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "campaignId" TEXT,
ADD COLUMN     "isArtworkReceipt" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "receiptKey" TEXT,
ADD COLUMN     "salesTaxCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "shippingCents" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "targetCents" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT NOT NULL DEFAULT '',
    "projectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignTask" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "dueDate" TEXT NOT NULL,
    "dueTime" TEXT,
    "category" TEXT NOT NULL DEFAULT 'Preparation',
    "completed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CampaignTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Painting" (
    "projectId" TEXT NOT NULL,
    "thumbnail" TEXT NOT NULL DEFAULT '',
    "dimensions" TEXT NOT NULL DEFAULT '',
    "medium" TEXT NOT NULL DEFAULT '',
    "framing" TEXT NOT NULL DEFAULT '',
    "availability" TEXT NOT NULL DEFAULT 'Available',
    "regularPriceCents" INTEGER,
    "batchId" TEXT,

    CONSTRAINT "Painting_pkey" PRIMARY KEY ("projectId")
);

-- CreateTable
CREATE TABLE "CampaignPainting" (
    "campaignId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "salePriceCents" INTEGER,

    CONSTRAINT "CampaignPainting_pkey" PRIMARY KEY ("campaignId","projectId")
);

-- CreateTable
CREATE TABLE "CampaignContent" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL DEFAULT '',
    "postingDate" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Draft',

    CONSTRAINT "CampaignContent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionBatch" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "plannedQuantity" INTEGER NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "weeklyQuantity" INTEGER NOT NULL,
    "startDate" TEXT NOT NULL,
    "completionDate" TEXT NOT NULL,

    CONSTRAINT "ProductionBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesGoal" (
    "id" TEXT NOT NULL,
    "targetCents" INTEGER NOT NULL,
    "startDate" TEXT NOT NULL,
    "dueDate" TEXT NOT NULL,
    "basis" TEXT NOT NULL DEFAULT 'Gross artwork receipts',
    "excludeSalesTax" BOOLEAN NOT NULL DEFAULT true,
    "excludeShipping" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "SalesGoal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_receiptKey_key" ON "Transaction"("receiptKey");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignTask" ADD CONSTRAINT "CampaignTask_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Painting" ADD CONSTRAINT "Painting_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Painting" ADD CONSTRAINT "Painting_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ProductionBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignPainting" ADD CONSTRAINT "CampaignPainting_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignPainting" ADD CONSTRAINT "CampaignPainting_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Painting"("projectId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignContent" ADD CONSTRAINT "CampaignContent_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionBatch" ADD CONSTRAINT "ProductionBatch_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Domain constraints also protect records written outside the UI.
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_status_check" CHECK ("status" IN ('Draft','Preparing','Live','Fulfillment','Closed')),
  ADD CONSTRAINT "Campaign_dates_check" CHECK ("startDate" <= "endDate"),
  ADD CONSTRAINT "Campaign_target_check" CHECK ("targetCents" >= 0);
ALTER TABLE "CampaignTask" ADD CONSTRAINT "CampaignTask_category_check" CHECK ("category" IN ('Painting','Preparation','Marketing','Fulfillment'));
ALTER TABLE "Painting" ADD CONSTRAINT "Painting_availability_check" CHECK ("availability" IN ('Available','Reserved','Sold','Not ready')),
  ADD CONSTRAINT "Painting_price_check" CHECK ("regularPriceCents" IS NULL OR "regularPriceCents" >= 0);
ALTER TABLE "CampaignPainting" ADD CONSTRAINT "CampaignPainting_price_check" CHECK ("salePriceCents" IS NULL OR "salePriceCents" >= 0);
ALTER TABLE "CampaignContent" ADD CONSTRAINT "CampaignContent_status_check" CHECK ("status" IN ('Draft','Posted'));
ALTER TABLE "ProductionBatch" ADD CONSTRAINT "ProductionBatch_quantity_check" CHECK ("plannedQuantity" > 0 AND "weeklyQuantity" > 0 AND "unitPriceCents" >= 0 AND "startDate" <= "completionDate");
ALTER TABLE "SalesGoal" ADD CONSTRAINT "SalesGoal_target_check" CHECK ("targetCents" >= 0 AND "startDate" <= "dueDate");
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_receipt_portions_check" CHECK ("salesTaxCents" >= 0 AND "shippingCents" >= 0 AND "salesTaxCents" + "shippingCents" <= "amountCents");
