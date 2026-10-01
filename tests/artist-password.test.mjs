import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Artist password setup stores only a salted scrypt digest", () => {
  const auth = source("lib/museum-artist-auth.ts");
  const schema = source("prisma/schema.prisma");
  assert.match(auth, /scrypt/);
  assert.match(auth, /randomBytes\(24\)/);
  assert.match(schema, /model ArtistCredential/);
  assert.match(schema, /passwordSalt String/);
  assert.match(schema, /passwordHash String/);
  assert.doesNotMatch(schema, /password\s+String/);
});

test("Artist Gate supports one-time setup and remembered sessions", () => {
  const gate = source("app/components/ArtistGate.tsx");
  const route = source("app/api/museum/artist-session/route.ts");
  assert.match(gate, /setupPassword: true/);
  assert.match(gate, /Remember this device for 30 days/);
  assert.match(gate, /session\?\.authenticated && session\.passwordConfigured/);
  assert.match(route, /verifyArtistPassword/);
  assert.match(route, /body\.remember === true/);
});

test("commerce credentials remain separate from the Artist password", () => {
  const auth = source("lib/museum-artist-auth.ts");
  assert.doesNotMatch(auth, /WARLOCK_API_KEY|PRINTFUL_API_KEY|ETSY_CLIENT_SECRET/);
});
