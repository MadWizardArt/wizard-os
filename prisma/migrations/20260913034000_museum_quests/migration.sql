-- CreateEnum
CREATE TYPE "MuseumQuestStatus" AS ENUM ('DRAFT', 'ACTIVE', 'WAITING', 'REVIEW', 'COMPLETE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MuseAssignmentRole" AS ENUM ('LEAD', 'SUPPORT', 'REVIEWER');

-- CreateTable
CREATE TABLE "MuseumQuest" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "brief" TEXT NOT NULL DEFAULT '',
    "status" "MuseumQuestStatus" NOT NULL DEFAULT 'ACTIVE',
    "projectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MuseumQuest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MuseAssignment" (
    "id" TEXT NOT NULL,
    "questId" TEXT NOT NULL,
    "museId" TEXT NOT NULL,
    "role" "MuseAssignmentRole" NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MuseAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MuseumQuest_status_idx" ON "MuseumQuest"("status");

-- CreateIndex
CREATE INDEX "MuseumQuest_projectId_idx" ON "MuseumQuest"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "MuseAssignment_questId_museId_key" ON "MuseAssignment"("questId", "museId");

-- CreateIndex
CREATE INDEX "MuseAssignment_museId_idx" ON "MuseAssignment"("museId");

-- AddForeignKey
ALTER TABLE "MuseumQuest" ADD CONSTRAINT "MuseumQuest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MuseAssignment" ADD CONSTRAINT "MuseAssignment_questId_fkey" FOREIGN KEY ("questId") REFERENCES "MuseumQuest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
