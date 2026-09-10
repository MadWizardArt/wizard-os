-- CreateEnum
CREATE TYPE "ProjectType" AS ENUM ('ARTWORK', 'COMMISSION', 'DIGITAL_PRODUCT', 'CONTENT', 'INTERNAL');
CREATE TYPE "ProjectStatus" AS ENUM ('PLANNED', 'ACTIVE', 'WAITING', 'BLOCKED', 'COMPLETE', 'ARCHIVED');
CREATE TYPE "StageStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'WAITING', 'COMPLETE', 'SKIPPED');
CREATE TYPE "TransactionType" AS ENUM ('INCOME', 'EXPENSE', 'REFUND');
CREATE TYPE "IncomeClass" AS ENUM ('ACTIVE', 'RECURRING', 'PASSIVE_LIKE');
CREATE TYPE "VentureStatus" AS ENUM ('IDEA', 'VALIDATING', 'ACTIVE', 'PAUSED', 'ARCHIVED');
CREATE TYPE "CustomerType" AS ENUM ('COLLECTOR', 'CLIENT', 'LEAD', 'PARTNER', 'OTHER');
CREATE TYPE "CustomerStatus" AS ENUM ('LEAD', 'ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "WorkflowTemplate" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "projectType" "ProjectType" NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkflowTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Customer" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT,
  "phone" TEXT,
  "type" "CustomerType" NOT NULL DEFAULT 'LEAD',
  "status" "CustomerStatus" NOT NULL DEFAULT 'LEAD',
  "notes" TEXT,
  "lastContactAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Venture" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "status" "VentureStatus" NOT NULL DEFAULT 'IDEA',
  "demand" INTEGER NOT NULL DEFAULT 3,
  "margin" INTEGER NOT NULL DEFAULT 3,
  "recurrence" INTEGER NOT NULL DEFAULT 3,
  "automation" INTEGER NOT NULL DEFAULT 3,
  "defensibility" INTEGER NOT NULL DEFAULT 3,
  "startupCost" INTEGER NOT NULL DEFAULT 3,
  "weeklyHours" INTEGER NOT NULL DEFAULT 3,
  "nextAction" TEXT,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Venture_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Project" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "type" "ProjectType" NOT NULL,
  "status" "ProjectStatus" NOT NULL DEFAULT 'PLANNED',
  "progress" INTEGER NOT NULL DEFAULT 0,
  "valueCents" INTEGER,
  "dueDate" TIMESTAMP(3),
  "nextAction" TEXT,
  "notes" TEXT,
  "templateId" TEXT,
  "customerId" TEXT,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkflowTemplateStage" (
  "id" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "defaultFieldsJson" TEXT NOT NULL DEFAULT '{}',
  CONSTRAINT "WorkflowTemplateStage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectStage" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "status" "StageStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "progress" INTEGER NOT NULL DEFAULT 0,
  "fieldsJson" TEXT NOT NULL DEFAULT '{}',
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectStage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Transaction" (
  "id" TEXT NOT NULL,
  "type" "TransactionType" NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "receivedAt" TIMESTAMP(3),
  "source" TEXT NOT NULL,
  "incomeClass" "IncomeClass",
  "isNonArt" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "projectId" TEXT,
  "ventureId" TEXT,
  "customerId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Project_status_idx" ON "Project"("status");
CREATE INDEX "Project_dueDate_idx" ON "Project"("dueDate");
CREATE UNIQUE INDEX "WorkflowTemplateStage_templateId_position_key" ON "WorkflowTemplateStage"("templateId", "position");
CREATE UNIQUE INDEX "ProjectStage_projectId_position_key" ON "ProjectStage"("projectId", "position");
CREATE INDEX "Transaction_receivedAt_idx" ON "Transaction"("receivedAt");
CREATE INDEX "Transaction_type_incomeClass_isNonArt_idx" ON "Transaction"("type", "incomeClass", "isNonArt");
CREATE INDEX "Customer_status_idx" ON "Customer"("status");
CREATE INDEX "Customer_lastContactAt_idx" ON "Customer"("lastContactAt");
CREATE INDEX "Venture_status_idx" ON "Venture"("status");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "WorkflowTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkflowTemplateStage" ADD CONSTRAINT "WorkflowTemplateStage_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "WorkflowTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectStage" ADD CONSTRAINT "ProjectStage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_ventureId_fkey" FOREIGN KEY ("ventureId") REFERENCES "Venture"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
