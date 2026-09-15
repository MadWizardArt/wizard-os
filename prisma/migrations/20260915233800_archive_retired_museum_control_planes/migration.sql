UPDATE "Project"
SET
  "status" = 'ARCHIVED',
  "archivedAt" = CURRENT_TIMESTAMP,
  "nextAction" = 'Retired Museum control-plane record'
WHERE
  "type" = 'INTERNAL'
  AND "archivedAt" IS NULL
  AND (
    "notes" LIKE 'MUSEUM_QUEST_V1:%'
    OR "notes" LIKE 'MUSEUM_FOCUS_V1:%'
    OR "notes" LIKE 'MUSEUM_BRIEF_V1:%'
  );
