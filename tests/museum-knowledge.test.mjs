import { test } from 'node:test';
import assert from 'node:assert/strict';
import { knowledgeEligibleForMuse } from '../lib/museum-knowledge-policy.ts';

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
