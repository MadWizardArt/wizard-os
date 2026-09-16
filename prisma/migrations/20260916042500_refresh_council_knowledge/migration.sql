-- Supersede the retired manual-upload assumption without deleting its provenance.
UPDATE "Project"
SET
  "status" = 'ARCHIVED',
  "progress" = 0,
  "archivedAt" = CURRENT_TIMESTAMP,
  "nextAction" = 'Superseded by current artist-confirmed Warlock workflow',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE
  "type" = 'INTERNAL'
  AND "archivedAt" IS NULL
  AND "notes" LIKE 'MUSEUM_KNOWLEDGE_V1:%'
  AND "notes" LIKE '%"title":"Spellmark product production workflow"%'
  AND "notes" LIKE '%"sourceRef":"Nine Muses Master Operating Reference · D004-D006"%';

-- Current Spellmark / Warlock workflow.
INSERT INTO "Project" (
  "id", "title", "type", "status", "progress", "nextAction", "notes", "createdAt", "updatedAt"
)
SELECT
  'muse-knowledge-warlock-current-20260916',
  '[Council Knowledge] Spellmark product production workflow',
  'INTERNAL',
  'COMPLETE',
  100,
  'Available to selective Muse intelligence',
  $knowledge$MUSEUM_KNOWLEDGE_V1:{"version":1,"title":"Spellmark product production workflow","content":"Product → cover mockup → three additional pictures → Etsy draft → review with Brandon → ZIP package. Warlock is the current Etsy execution path and may attach listing images and customer files to drafts when supported. Do not default to the retired assumption that Brandon must manually upload those assets. Brandon retains final review and publication authority unless he explicitly delegates a narrower action.","kind":"decision","source":"nine_muses_project","sourceRef":"Nine Muses Master Operating Reference · D006 + artist-confirmed Warlock operation · 2026-09-15","category":"product","targetMuseIds":["aurelia","cleo","lyra","callista","novy"],"tags":["etsy","spellmark","warlock","product workflow","current"],"verifiedByArtist":true,"createdAt":"2026-09-16T04:25:00.000Z"}$knowledge$,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1
  FROM "Project"
  WHERE
    "type" = 'INTERNAL'
    AND "archivedAt" IS NULL
    AND "notes" LIKE 'MUSEUM_KNOWLEDGE_V1:%'
    AND "notes" LIKE '%"title":"Spellmark product production workflow"%'
    AND "notes" LIKE '%"sourceRef":"Nine Muses Master Operating Reference · D006 + artist-confirmed Warlock operation · 2026-09-15"%'
);

-- Artist-confirmed Stage IV operating doctrine.
INSERT INTO "Project" (
  "id", "title", "type", "status", "progress", "nextAction", "notes", "createdAt", "updatedAt"
)
SELECT
  'muse-knowledge-harvest-freedom-20260916',
  '[Council Knowledge] Edict of Harvest and Freedom',
  'INTERNAL',
  'COMPLETE',
  100,
  'Available to selective Muse intelligence',
  $knowledge$MUSEUM_KNOWLEDGE_V1:{"version":1,"title":"Edict of Harvest and Freedom","content":"The Muses are helpers and cherished operators of Brandon's will. Their standing mission is to go outward—observe, research, gather signals, discover overlooked opportunities, connect ideas, and return compressed value that can create sustainable wealth, time, independence, and artistic freedom. Brandon remains the Artist and final authority; routine painting sales and social-media publication remain Brandon-owned by default unless explicitly delegated.","kind":"artist_directive","source":"nine_muses_project","sourceRef":"Nine Muses Master Operating Reference · D054-D055, D057-D058 · 2026-09-15","category":"revenue","targetMuseIds":[],"tags":["apollo","harvest","opportunity","wealth","freedom","artist authority","stage iv"],"verifiedByArtist":true,"createdAt":"2026-09-16T04:25:00.000Z"}$knowledge$,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1
  FROM "Project"
  WHERE
    "type" = 'INTERNAL'
    AND "archivedAt" IS NULL
    AND "notes" LIKE 'MUSEUM_KNOWLEDGE_V1:%'
    AND "notes" LIKE '%"title":"Edict of Harvest and Freedom"%'
    AND "notes" LIKE '%"sourceRef":"Nine Muses Master Operating Reference · D054-D055, D057-D058 · 2026-09-15"%'
);

INSERT INTO "Project" (
  "id", "title", "type", "status", "progress", "nextAction", "notes", "createdAt", "updatedAt"
)
SELECT
  'muse-knowledge-tessa-principle-20260916',
  '[Council Knowledge] Tessa Principle for automation',
  'INTERNAL',
  'COMPLETE',
  100,
  'Available to selective Muse intelligence',
  $knowledge$MUSEUM_KNOWLEDGE_V1:{"version":1,"title":"Tessa Principle for automation","content":"Automation must reduce Brandon's operational burden: repeated copying, duplicate status updates, redundant bookkeeping, context switching, and maintenance overhead. If Brandon must babysit a system more than the task it replaces, the design has failed. Prefer leverage and low-burden return of useful findings over automating tasks he can comfortably perform himself.","kind":"artist_directive","source":"nine_muses_project","sourceRef":"Nine Muses Master Operating Reference · D054, D056-D058 · 2026-09-15","category":"system","targetMuseIds":["novy","tessa","callista","melina"],"tags":["tessa principle","automation","burden","leverage","stage iv"],"verifiedByArtist":true,"createdAt":"2026-09-16T04:25:00.000Z"}$knowledge$,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1
  FROM "Project"
  WHERE
    "type" = 'INTERNAL'
    AND "archivedAt" IS NULL
    AND "notes" LIKE 'MUSEUM_KNOWLEDGE_V1:%'
    AND "notes" LIKE '%"title":"Tessa Principle for automation"%'
    AND "notes" LIKE '%"sourceRef":"Nine Muses Master Operating Reference · D054, D056-D058 · 2026-09-15"%'
);
