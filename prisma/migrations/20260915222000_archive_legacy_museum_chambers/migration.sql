UPDATE "Project"
SET
  "status" = 'ARCHIVED',
  "archivedAt" = CURRENT_TIMESTAMP,
  "nextAction" = 'Legacy Chamber chat retired; use Selective Intelligence'
WHERE
  "type" = 'INTERNAL'
  AND "archivedAt" IS NULL
  AND "notes" LIKE 'MUSEUM_CHAMBER_V1:%';
