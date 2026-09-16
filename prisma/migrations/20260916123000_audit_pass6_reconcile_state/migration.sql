-- Audit Pass 6 reconciles the perfected Nine Muses canon with production state,
-- makes Painting.availability authoritative for completed artwork project state,
-- and activates the existing September campaign without inventing discount prices.

-- PR #59 briefly archived these doctrines. The synthesized Nine Muses Master
-- restored both, so reactivate the preserved capsules rather than deleting history.
UPDATE "Project"
SET
  "status" = 'COMPLETE',
  "progress" = 100,
  "archivedAt" = NULL,
  "nextAction" = 'Restored to the canonical Nine Muses master on 2026-09-16; available to selective Muse intelligence',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE
  "type" = 'INTERNAL'
  AND "notes" LIKE 'MUSEUM_KNOWLEDGE_V1:%'
  AND (
    "notes" LIKE '%"title":"Edict of Harvest and Freedom"%'
    OR "notes" LIKE '%"title":"Tessa Principle for automation"%'
  );

-- Seed the constitutional basis immediately so Council behavior is correct even
-- before the Artist next opens the Knowledge Inbox.
INSERT INTO "Project" (
  "id", "title", "type", "status", "progress", "nextAction", "notes", "createdAt", "updatedAt"
)
SELECT
  'council-constitutional-basis-20260916',
  '[Council Knowledge] Nine Muses constitutional basis',
  'INTERNAL',
  'COMPLETE',
  100,
  'Available to selective Muse intelligence',
  'MUSEUM_KNOWLEDGE_V1:{"version":1,"title":"Nine Muses constitutional basis","content":"This document is the canonical specification for the Nine Muses Council. When the Artist invokes ‘Convene Council,’ use this canon to resolve Council identities, portfolios, governance, and operating behavior. Project-specific instructions may extend this canon but should not silently contradict it. Core principle: ‘The Muses leave their Father Apollo to enlighten the World.’","kind":"artist_directive","source":"nine_muses_project","sourceRef":"Nine Muses Synthesized Master · Constitutional Basis · 2026-09-16","category":"system","targetMuseIds":[],"tags":["constitution","convene council","apollo","governance","core principle"],"verifiedByArtist":true,"createdAt":"2026-09-16T15:53:00.000Z"}',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1
  FROM "Project"
  WHERE "type" = 'INTERNAL'
    AND "archivedAt" IS NULL
    AND "notes" LIKE 'MUSEUM_KNOWLEDGE_V1:%'
    AND "notes" LIKE '%"title":"Nine Muses constitutional basis"%'
);

-- Completed artwork is complete creative work. Sales and fulfillment continue in
-- the artwork lifecycle rather than keeping the generic project workflow open.
UPDATE "Project" AS project
SET
  "status" = 'COMPLETE',
  "progress" = 100,
  "nextAction" = CASE
    WHEN painting."availability" = 'Sold' THEN 'Sold Archive — sale and fulfillment tracked from Inventory'
    ELSE 'Available Inventory — sales lifecycle managed from Inventory'
  END,
  "updatedAt" = CURRENT_TIMESTAMP
FROM "Painting" AS painting
WHERE project."id" = painting."projectId"
  AND project."type" = 'ARTWORK'
  AND project."archivedAt" IS NULL
  AND painting."availability" IN ('Available', 'Reserved', 'Sold');

UPDATE "ProjectStage" AS stage
SET
  "status" = 'COMPLETE',
  "progress" = 100,
  "completedAt" = COALESCE(stage."completedAt", CURRENT_TIMESTAMP),
  "updatedAt" = CURRENT_TIMESTAMP
FROM "Painting" AS painting
WHERE stage."projectId" = painting."projectId"
  AND painting."availability" IN ('Available', 'Reserved', 'Sold')
  AND stage."name" IN ('Paint', 'Prepare for sale');

-- Fulfillment is deliberately separate from the creative project workflow.
UPDATE "ProjectStage" AS stage
SET
  "status" = 'SKIPPED',
  "progress" = 100,
  "completedAt" = COALESCE(stage."completedAt", CURRENT_TIMESTAMP),
  "updatedAt" = CURRENT_TIMESTAMP
FROM "Painting" AS painting
WHERE stage."projectId" = painting."projectId"
  AND painting."availability" IN ('Available', 'Reserved', 'Sold')
  AND stage."name" = 'Fulfill';

-- Link the currently imported, available MadWizardArt.com inventory to the
-- September campaign. salePriceCents stays NULL so regular prices are preserved
-- and no discount is invented on the Artist's behalf.
INSERT INTO "CampaignPainting" ("campaignId", "projectId", "salePriceCents")
SELECT
  campaign."id",
  painting."projectId",
  NULL
FROM "Campaign" AS campaign
JOIN "Painting" AS painting ON painting."availability" = 'Available'
JOIN "Project" AS project ON project."id" = painting."projectId"
WHERE campaign."id" = 'studio-september-2026'
  AND project."archivedAt" IS NULL
  AND project."notes" LIKE 'Imported from MadWizardArt.com on September 12, 2026.%'
ON CONFLICT ("campaignId", "projectId") DO NOTHING;

-- Actionable runway to the September 25 launch. These are operational shells;
-- pricing and final copy remain Artist-controlled.
INSERT INTO "CampaignTask" (
  "id", "campaignId", "title", "dueDate", "dueTime", "category", "completed"
)
SELECT task.*
FROM (
  VALUES
    ('sep26-inventory-review', 'studio-september-2026', 'Confirm campaign paintings, framing, availability, and regular prices', '2026-09-17', NULL, 'Preparation', false),
    ('sep26-sale-pricing', 'studio-september-2026', 'Set campaign sale prices and verify MadWizardArt.com checkout', '2026-09-18', NULL, 'Preparation', false),
    ('sep26-photo-review', 'studio-september-2026', 'Review sale artwork photos and replace any weak listing images', '2026-09-19', NULL, 'Preparation', false),
    ('sep26-copy-final', 'studio-september-2026', 'Finalize collector email and social sale announcement copy', '2026-09-20', NULL, 'Marketing', false),
    ('sep26-schedule-content', 'studio-september-2026', 'Schedule launch, midpoint, 48-hour, and final-day campaign posts', '2026-09-22', NULL, 'Marketing', false),
    ('sep26-final-qa', 'studio-september-2026', 'Final QA: inventory, prices, links, checkout, and campaign dates', '2026-09-24', NULL, 'Preparation', false),
    ('sep26-launch', 'studio-september-2026', 'Launch End-of-September Studio Sale', '2026-09-25', '09:00', 'Marketing', false),
    ('sep26-midpoint', 'studio-september-2026', 'Mid-sale inventory check and collector follow-up', '2026-09-27', NULL, 'Marketing', false),
    ('sep26-final-push', 'studio-september-2026', 'Publish final 48-hour campaign push', '2026-09-29', NULL, 'Marketing', false),
    ('sep26-closeout', 'studio-september-2026', 'Close campaign, record sales, and review results', '2026-09-30', '21:00', 'Fulfillment', false)
) AS task("id", "campaignId", "title", "dueDate", "dueTime", "category", "completed")
WHERE EXISTS (SELECT 1 FROM "Campaign" WHERE "id" = 'studio-september-2026')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "CampaignContent" (
  "id", "campaignId", "title", "text", "postingDate", "status"
)
SELECT content.*
FROM (
  VALUES
    ('sep26-content-teaser', 'studio-september-2026', 'Studio sale teaser', '', '2026-09-22', 'Draft'),
    ('sep26-content-launch', 'studio-september-2026', 'Studio sale launch', '', '2026-09-25', 'Draft'),
    ('sep26-content-midpoint', 'studio-september-2026', 'Mid-sale collector reminder', '', '2026-09-27', 'Draft'),
    ('sep26-content-48h', 'studio-september-2026', 'Final 48 hours', '', '2026-09-29', 'Draft'),
    ('sep26-content-final', 'studio-september-2026', 'Final day', '', '2026-09-30', 'Draft')
) AS content("id", "campaignId", "title", "text", "postingDate", "status")
WHERE EXISTS (SELECT 1 FROM "Campaign" WHERE "id" = 'studio-september-2026')
ON CONFLICT ("id") DO NOTHING;
