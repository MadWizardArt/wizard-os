import { test } from 'node:test';
import assert from 'node:assert/strict';
import { knowledgeEligibleForMuse } from '../lib/museum-knowledge-policy.ts';
import { CANONICAL_NINE_MUSES_KNOWLEDGE } from '../lib/museum-knowledge-seed.ts';

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

test('canonical Council knowledge uses current Warlock and Stage IV directives', () => {
  const byTitle = new Map(CANONICAL_NINE_MUSES_KNOWLEDGE.map((entry) => [entry.title, entry]));
  const warlock = byTitle.get('Spellmark product production workflow');
  const harvest = byTitle.get('Edict of Harvest and Freedom');
  const tessa = byTitle.get('Tessa Principle for automation');

  assert.ok(warlock);
  assert.match(warlock.content, /Warlock is the current Etsy execution path/);
  assert.doesNotMatch(warlock.content, /Brandon manually uploads Etsy images/i);

  assert.ok(harvest);
  assert.match(harvest.content, /go outward/);
  assert.match(harvest.content, /Brandon remains the Artist and final authority/);

  assert.ok(tessa);
  assert.match(tessa.content, /must reduce Brandon's operational burden/);
  assert.match(tessa.content, /babysit a system/);
  assert.ok(tessa.targetMuseIds.includes('novy'));
});
