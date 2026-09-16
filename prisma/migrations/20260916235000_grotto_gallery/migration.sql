CREATE TABLE "GrottoImage" (
    "id" TEXT NOT NULL,
    "museId" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "imageData" BYTEA NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'manual',
    "providerWorkflowId" TEXT,
    "providerImageId" TEXT,
    "prompt" TEXT NOT NULL DEFAULT '',
    "recipeJson" TEXT NOT NULL DEFAULT '{}',
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "canonical" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrottoImage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GrottoImage_providerImageId_key" ON "GrottoImage"("providerImageId");
CREATE INDEX "GrottoImage_museId_deletedAt_createdAt_idx" ON "GrottoImage"("museId", "deletedAt", "createdAt");
CREATE INDEX "GrottoImage_museId_favorite_idx" ON "GrottoImage"("museId", "favorite");
CREATE INDEX "GrottoImage_providerWorkflowId_idx" ON "GrottoImage"("providerWorkflowId");
