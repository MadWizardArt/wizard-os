import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePgSslMode } from '../lib/database-url.ts';

test('runtime PostgreSQL URLs make current verify-full semantics explicit', () => {
  assert.equal(
    normalizePgSslMode('postgresql://wizard:secret@example.test/db?sslmode=require&channel_binding=require'),
    'postgresql://wizard:secret@example.test/db?sslmode=verify-full&channel_binding=require',
  );
  assert.equal(
    normalizePgSslMode('postgresql://wizard:secret@example.test/db?sslmode=prefer'),
    'postgresql://wizard:secret@example.test/db?sslmode=verify-full',
  );
  assert.equal(
    normalizePgSslMode('postgresql://wizard:secret@example.test/db?sslmode=verify-ca'),
    'postgresql://wizard:secret@example.test/db?sslmode=verify-full',
  );
});

test('explicitly different SSL choices and URLs without sslmode are unchanged', () => {
  assert.equal(
    normalizePgSslMode('postgresql://wizard:secret@example.test/db?sslmode=disable'),
    'postgresql://wizard:secret@example.test/db?sslmode=disable',
  );
  assert.equal(
    normalizePgSslMode('postgresql://wizard:secret@example.test/db?pool_timeout=10'),
    'postgresql://wizard:secret@example.test/db?pool_timeout=10',
  );
});
