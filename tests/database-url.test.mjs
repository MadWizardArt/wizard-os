import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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


test('production migration retries transient failures but still fails closed', () => {
  const source = readFileSync(new URL('../scripts/production-migrate.mjs', import.meta.url), 'utf8');
  assert.match(source, /VERCEL_ENV !== "production"/);
  assert.match(source, /const MAX_ATTEMPTS = 3/);
  assert.match(source, /const BACKOFF_MS = \[0, 5000, 15000\]/);
  assert.match(source, /prisma", "migrate", "deploy"/);
  assert.match(source, /Production migration failed after/);
  assert.match(source, /process\.exit\(result\.status \?\? 1\)/);
});
