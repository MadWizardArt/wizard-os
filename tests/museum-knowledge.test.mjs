import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeCouncilKnowledge, readRelevantCouncilKnowledge } from '../lib/museum-knowledge.ts';

function knowledge(overrides = {}) {
  return {
    version: 1,
    title: 'Capsule',
    content: 'A concise piece of Council context.',
    kind: 'working_context',
    source: 'nine_muses_project',
    sourceRef: 'Nine Muses Project · test',
    category: 'product',
    targetMuseIds: ['aurelia'],
    tags: ['test'],
    verifiedByArtist: false,
    createdAt: '2026-09-15T00:00:00.000Z',
    ...overrides,
  };
}

function fakeDb(entries) {
  return {
    project: {
      async findMany() {
        return entries.map((entry, index) => ({
          id: `k${index + 1}`,
          notes: encodeCouncilKnowledge(entry),
          createdAt: new Date(entry.createdAt),
        }));
      },
    },
  };
}

test('unverified Project capsules are inert until Artist verification', async () => {
  const unverifiedDirective = knowledge({
    title: 'Unverified directive',
    kind: 'artist_directive',
    content: 'This must never silently become active authority.',
    verifiedByArtist: false,
  });
  const verifiedReference = knowledge({
    title: 'Verified reference',
    kind: 'reference',
    sourceRef: 'Nine Muses Project · verified test',
    content: 'This may inform Aurelia after Artist verification.',
    verifiedByArtist: true,
  });

  const result = await readRelevantCouncilKnowledge(fakeDb([unverifiedDirective, verifiedReference]), 'aurelia', 'product', 8);
  assert.equal(result.length, 1);
  assert.equal(result[0].title, 'Verified reference');
  assert.equal(result[0].verifiedByArtist, true);
});

test('verified knowledge still respects Muse targeting', async () => {
  const aureliaOnly = knowledge({ title: 'Aurelia only', verifiedByArtist: true, sourceRef: 'target:aurelia' });
  const result = await readRelevantCouncilKnowledge(fakeDb([aureliaOnly]), 'cleo', 'product', 8);
  assert.deepEqual(result, []);
});
