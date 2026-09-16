-- Brandon explicitly uncanonized these Stage IV doctrines on 2026-09-16.
-- Preserve their records for provenance, but remove them from active Muse retrieval.
UPDATE "Project"
SET
  "status" = 'ARCHIVED',
  "progress" = 0,
  "archivedAt" = CURRENT_TIMESTAMP,
  "nextAction" = 'Uncanonized by the Artist on 2026-09-16; retained for provenance only',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE
  "type" = 'INTERNAL'
  AND "archivedAt" IS NULL
  AND "notes" LIKE 'MUSEUM_KNOWLEDGE_V1:%'
  AND (
    "notes" LIKE '%"title":"Edict of Harvest and Freedom"%'
    OR "notes" LIKE '%"title":"Tessa Principle for automation"%'
  );
