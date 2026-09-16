import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const projectStateSource = readFileSync(
  new URL('../lib/artwork-project-state.ts', import.meta.url),
  'utf8',
);
const artworkRouteSource = readFileSync(
  new URL('../app/api/artwork/route.ts', import.meta.url),
  'utf8',
);
const campaignRouteSource = readFileSync(
  new URL('../app/api/campaigns/route.ts', import.meta.url),
  'utf8',
);
const migrationSource = readFileSync(
  new URL('../prisma/migrations/20260916123000_audit_pass6_reconcile_state/migration.sql', import.meta.url),
  'utf8',
);
const soldCounterSource = readFileSync(
  new URL('../app/components/SoldPaintingsCounterClient.tsx', import.meta.url),
  'utf8',
);

test('completed artwork project state is derived from artwork lifecycle', () => {
  assert.match(projectStateSource, /ProjectStatus\.COMPLETE/);
  assert.match(projectStateSource, /StageStatus\.SKIPPED/);
  assert.match(projectStateSource, /completedAt: null/);
  assert.match(artworkRouteSource, /syncCompletedArtworkProject/);
  assert.match(campaignRouteSource, /syncCompletedArtworkProject/);
});

test('September activation preserves prices and adds an operational runway', () => {
  assert.match(migrationSource, /studio-september-2026/);
  assert.match(migrationSource, /salePriceCents/);
  assert.match(migrationSource, /NULL/);
  assert.match(migrationSource, /sep26-final-qa/);
  assert.match(migrationSource, /sep26-launch/);
  assert.match(migrationSource, /sep26-closeout/);
});

test('undocumented historical archive value is never presented as profit', () => {
  assert.match(soldCounterSource, /Historical listed value/);
  assert.match(soldCounterSource, /profit is intentionally not estimated/);
  assert.doesNotMatch(soldCounterSource, /Provisional profit/);
});
