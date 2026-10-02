import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("core API routes are Artist-gated by default", () => {
  const middleware = source("middleware.ts");
  assert.match(middleware, /matcher:\s*"\/api\/:path\*"/);
  assert.match(middleware, /verifyArtistSession\(request\)/);
  assert.match(middleware, /Artist session required/);
  assert.doesNotMatch(middleware, /\/api\/campaigns|\/api\/projects|\/api\/transactions/);
});

test("only public status and independently authenticated integrations bypass the shared gate", () => {
  const middleware = source("middleware.ts");
  assert.match(middleware, /"\/api\/health"/);
  assert.match(middleware, /"\/api\/museum\/artist-session"/);
  for (const prefix of ["etsy", "grotto", "museum/knowledge/intake", "printful", "warlock"]) {
    assert.match(middleware, new RegExp(`api\\/${prefix.replaceAll("/", "\\/")}`));
  }
});

test("the app shell and browser mutations share the Artist security boundary", () => {
  const middleware = source("middleware.ts");
  const boundary = middleware.slice(middleware.indexOf("export function middleware"));
  assert.match(source("app/layout.tsx"), /<ArtistGate>/);
  assert.match(middleware, /Same-origin Artist action required/);
  assert.ok(boundary.indexOf("!isSameOrigin(request)") < boundary.indexOf("hasIndependentAuthentication(pathname)"));
  assert.match(source("lib/request-security.ts"), /x-forwarded-host/);
  assert.match(source("lib/request-security.ts"), /x-forwarded-proto/);
});

test("health and seed behavior reflect PostgreSQL reality", () => {
  const health = source("app/api/health/route.ts");
  const seed = source("prisma/seed.mjs");
  assert.match(health, /prisma\.\$queryRaw`SELECT 1`/);
  assert.match(health, /status:\s*503/);
  assert.match(seed, /@prisma\/adapter-pg/);
  assert.doesNotMatch(seed, /better-sqlite3|dev\.db|starter projects/i);
});

test("shared origin check honors the actual request host when Next internal URL differs", async () => {
  const { isSameOrigin } = await import("../lib/request-security.ts");
  const { sameOrigin } = await import("../lib/warlock-products.ts");
  const request = {headers: new Headers({origin:"http://127.0.0.1:3000",host:"127.0.0.1:3000"}),nextUrl:new URL("http://localhost:3000/api")};
  assert.equal(isSameOrigin(request),true);assert.equal(sameOrigin(request),true);
  request.headers.set("origin","https://example.invalid");assert.equal(isSameOrigin(request),false);assert.equal(sameOrigin(request),false);
  request.headers.set("origin","not a URL");assert.equal(isSameOrigin(request),false);
  assert.match(source("app/api/campaigns/lifecycle/route.ts"), /isSameOrigin as sameOrigin/);
});
