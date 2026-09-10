PRAGMA foreign_keys=ON;

CREATE TABLE "Project" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "title" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PLANNED',
  "progress" INTEGER NOT NULL DEFAULT 0,
  "valueCents" INTEGER,
  "dueDate" DATETIME,
  "nextAction" TEXT,
  "notes" TEXT,
  "templateId" TEXT,
  "archivedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Project_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "WorkflowTemplate" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "WorkflowTemplate" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "projectType" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "WorkflowTemplateStage" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "templateId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "defaultFieldsJson" TEXT NOT NULL DEFAULT '{}',
  CONSTRAINT "WorkflowTemplateStage_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "WorkflowTemplate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ProjectStage" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
  "progress" INTEGER NOT NULL DEFAULT 0,
  "fieldsJson" TEXT NOT NULL DEFAULT '{}',
  "completedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "ProjectStage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Transaction" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "type" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "occurredAt" DATETIME NOT NULL,
  "receivedAt" DATETIME,
  "source" TEXT NOT NULL,
  "incomeClass" TEXT,
  "isNonArt" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "projectId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Transaction_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "Project_status_idx" ON "Project"("status");
CREATE INDEX "Project_dueDate_idx" ON "Project"("dueDate");
CREATE UNIQUE INDEX "WorkflowTemplateStage_templateId_position_key" ON "WorkflowTemplateStage"("templateId", "position");
CREATE UNIQUE INDEX "ProjectStage_projectId_position_key" ON "ProjectStage"("projectId", "position");
CREATE INDEX "Transaction_receivedAt_idx" ON "Transaction"("receivedAt");
CREATE INDEX "Transaction_type_incomeClass_isNonArt_idx" ON "Transaction"("type", "incomeClass", "isNonArt");
