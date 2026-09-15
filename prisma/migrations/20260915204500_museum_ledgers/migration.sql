-- Museum-owned ledgers keep Muse system records out of the operational Project table.
CREATE TABLE "MuseumProposal" (
    "id" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "museId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MuseumProposal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MuseumIntelligenceQuest" (
    "id" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "museId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MuseumIntelligenceQuest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MuseumProposal_sourceKey_key" ON "MuseumProposal"("sourceKey");
CREATE INDEX "MuseumProposal_museId_status_idx" ON "MuseumProposal"("museId", "status");
CREATE INDEX "MuseumProposal_category_idx" ON "MuseumProposal"("category");
CREATE INDEX "MuseumIntelligenceQuest_status_createdAt_idx" ON "MuseumIntelligenceQuest"("status", "createdAt");
CREATE INDEX "MuseumIntelligenceQuest_museId_category_idx" ON "MuseumIntelligenceQuest"("museId", "category");

-- Preserve stable ids so existing memory provenance/sourceProposalId references remain valid.
INSERT INTO "MuseumProposal" ("id", "payload", "sourceKey", "museId", "category", "status", "createdAt", "updatedAt")
SELECT
    p."id",
    p."notes",
    COALESCE(j.payload->>'sourceKey', 'legacy:' || p."id"),
    COALESCE(j.payload->>'museId', 'unknown'),
    COALESCE(j.payload->>'category', 'experiment'),
    COALESCE(j.payload->>'status', 'proposed'),
    p."createdAt",
    p."updatedAt"
FROM "Project" p
CROSS JOIN LATERAL (SELECT regexp_replace(p."notes", '^MUSEUM_PROPOSAL_V1:', '')::jsonb AS payload) j
WHERE p."notes" LIKE 'MUSEUM_PROPOSAL_V1:%'
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "MuseumIntelligenceQuest" ("id", "payload", "museId", "category", "status", "createdAt", "updatedAt")
SELECT
    p."id",
    p."notes",
    COALESCE(j.payload->>'museId', 'unknown'),
    COALESCE(j.payload->>'category', 'experiment'),
    COALESCE(j.payload->>'status', 'candidate'),
    p."createdAt",
    p."updatedAt"
FROM "Project" p
CROSS JOIN LATERAL (SELECT regexp_replace(p."notes", '^MUSEUM_INTELLIGENCE_V1:', '')::jsonb AS payload) j
WHERE p."notes" LIKE 'MUSEUM_INTELLIGENCE_V1:%'
ON CONFLICT ("id") DO NOTHING;

-- These internal records were never operational work. Remove the legacy Project copies after migration.
UPDATE "Campaign"
SET "projectId" = NULL
WHERE "projectId" IN (
    SELECT "id" FROM "Project"
    WHERE "notes" LIKE 'MUSEUM_PROPOSAL_V1:%' OR "notes" LIKE 'MUSEUM_INTELLIGENCE_V1:%'
);

UPDATE "Transaction"
SET "projectId" = NULL
WHERE "projectId" IN (
    SELECT "id" FROM "Project"
    WHERE "notes" LIKE 'MUSEUM_PROPOSAL_V1:%' OR "notes" LIKE 'MUSEUM_INTELLIGENCE_V1:%'
);

DELETE FROM "Project"
WHERE "notes" LIKE 'MUSEUM_PROPOSAL_V1:%' OR "notes" LIKE 'MUSEUM_INTELLIGENCE_V1:%';
