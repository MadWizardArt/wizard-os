import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("retired Muse handoff cannot be mistaken for Etsy draft creation", () => {
  assert.equal(existsSync(new URL("../app/api/etsy/aurelia-drafts/route.ts", import.meta.url)), false);
  assert.doesNotMatch(source("app/api/etsy/drafts/route.ts"), /MUSE_HANDOFF_SECRET|aurelia-drafts/);
});

test("OAuth callback stores only the encrypted Etsy grant", () => {
  const callback = source("app/api/etsy/callback/route.ts");
  assert.match(callback, /saveEtsyConnection\(session\)/);
  assert.match(callback, /etsy_session/);
  const auth = source("lib/warlock-auth.ts");
  assert.match(auth, /WARLOCK_SHOP_ID/);
  assert.match(auth, /etsy_shop_not_allowed/);
  assert.match(auth, /timingSafeEqual/);
  assert.match(auth, /WARLOCK_API_KEY/);
});

test("all Etsy draft actions share the operator-or-browser authorization check", () => {
  const routes = [
    "app/api/etsy/shop/route.ts",
    "app/api/etsy/drafts/route.ts",
    "app/api/etsy/listings/route.ts",
    "app/api/etsy/listings/[listingId]/route.ts",
    "app/api/etsy/listings/[listingId]/images/route.ts",
    "app/api/etsy/listings/[listingId]/files/route.ts",
    "app/api/etsy/listings/[listingId]/status/route.ts",
  ];
  for (const path of routes) assert.match(source(path), /getEtsyRequestContext/);
});

test("physical POD drafts require explicit Etsy fulfillment profiles and remain distinct from downloads", () => {
  const drafts = source("app/api/etsy/drafts/route.ts");
  assert.match(drafts, /listingType === "physical"/);
  assert.match(drafts, /shipping_profile_id/);
  assert.match(drafts, /readiness_state_id/);
  assert.match(drafts, /type: listingType/);
  const profiles = source("app/api/etsy/commerce-profiles/route.ts");
  assert.match(profiles, /shipping-profiles/);
  assert.match(profiles, /readiness-state-definitions/);
});
