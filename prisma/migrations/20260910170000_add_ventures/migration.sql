CREATE TABLE "Venture" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "status" TEXT NOT NULL DEFAULT 'IDEA',
  "demand" INTEGER NOT NULL DEFAULT 3,
  "margin" INTEGER NOT NULL DEFAULT 3,
  "recurrence" INTEGER NOT NULL DEFAULT 3,
  "automation" INTEGER NOT NULL DEFAULT 3,
  "defensibility" INTEGER NOT NULL DEFAULT 3,
  "startupCost" INTEGER NOT NULL DEFAULT 3,
  "weeklyHours" INTEGER NOT NULL DEFAULT 3,
  "nextAction" TEXT,
  "archivedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

ALTER TABLE "Transaction" ADD COLUMN "ventureId" TEXT REFERENCES "Venture"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Venture_status_idx" ON "Venture"("status");
