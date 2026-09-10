-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "type" TEXT NOT NULL DEFAULT 'LEAD',
    "status" TEXT NOT NULL DEFAULT 'LEAD',
    "notes" TEXT,
    "lastContactAt" DATETIME,
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "customerId" TEXT REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD COLUMN "customerId" TEXT REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Customer_status_idx" ON "Customer"("status");
CREATE INDEX "Customer_lastContactAt_idx" ON "Customer"("lastContactAt");
