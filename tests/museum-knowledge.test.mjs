import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { knowledgeEligibleForMuse } from '../lib/museum-knowledge-policy.ts';

const canonicalSeedSource = readFileSync(
  new URL('../lib/museum-knowledge-seed.ts', import.meta.url),
  'utf8',
);

test('unverified Project capsules are inert until Artist verification', () => {
  const unverified = { verifiedByArtist: false, targetMuseIds: ['aurelia'] };
  const verified = { verifiedByArtist: true, targetMuseIds: ['aurelia'] };
  assert.equal(knowledgeEligibleForMuse(unverified, 'aurelia'), false);
  assert.equal(knowledgeEligibleForMuse(verified, 'aurelia'), true);
});

test('verified knowledge still respects Muse targeting', () => {
  const aureliaOnly = { verifiedByArtist: true, targetMuseIds: ['aurelia'] };
  const councilWide = { verifiedByArtist: true, targetMuseIds: [] };
  assert.equal(knowledgeEligibleForMuse(aureliaOnly, 'cleo'), false);
  assert.equal(knowledgeEligibleForMuse(councilWide, 'cleo'), true);
});

test('canonical Council knowledge uses the current Warlock workflow without uncanonized Stage IV doctrine', () => {
  assert.match(canonicalSeedSource, /Warlock is the current Etsy execution path/);
  assert.doesNotMatch(canonicalSeedSource, /Brandon manually uploads Etsy images and customer files/);
  assert.doesNotMatch(canonicalSeedSource, /title: "Edict of Harvest and Freedom"/);
  assert.doesNotMatch(canonicalSeedSource, /title: "Tessa Principle for automation"/);
});
