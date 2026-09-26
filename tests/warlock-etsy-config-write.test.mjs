import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  configuredListingStatus,
  listingConfigurationBlockers,
  validateEtsyConfigurationSelection,
} from "../lib/warlock-commerce/etsy-config-selection.ts";

const source = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

const listing = {
  id: "listing-1",
  fulfillment: "PHYSICAL",
  title: "Volans",
  description: "Approved",
  tagsJson: "[]",
  taxonomyId: null,
  shippingProfileId: null,
  readinessStateId: null,
  quantity: 999,
  whoMade: "i_did",
  whenMade: "2020_2026",
  isSupply: false,
  shouldAutoRenew: true,
  etsyListingId: null,
  printfulSyncProductId: null,
  lastDraftSyncAt: null,
  status: "CONFIG",
  assets: [{
    id: "link-1",
    kind: "image",
    position: 1,
    etsyRemoteId: null,
    etsySyncedAt: null,
    asset: {
      id: "asset-1",
      role: "hero",
      fileName: "hero.jpg",
      blobUrl: "https://example.test/hero.jpg",
      pathname: "hero.jpg",
      contentType: "image/jpeg",
      byteSize: 100,
    },
  }],
};

test("physical Etsy configuration requires taxonomy, shipping, and readiness IDs", () => {
  assert.deepEqual(validateEtsyConfigurationSelection({
    fulfillment: "PHYSICAL",
    taxonomyId: 123,
  }), [
    "shipping_profile_id_required",
    "readiness_state_id_required",
  ]);

  assert.deepEqual(validateEtsyConfigurationSelection({
    fulfillment: "PHYSICAL",
    taxonomyId: 123,
    shippingProfileId: "456",
    readinessStateId: "789",
  }), []);
});

test("digital Etsy configuration rejects physical fulfillment profile IDs", () => {
  assert.deepEqual(validateEtsyConfigurationSelection({
    fulfillment: "DIGITAL",
    taxonomyId: 123,
    shippingProfileId: "456",
  }), ["digital_shipping_profile_not_allowed"]);
});

test("verified listing configuration becomes READY only when listing essentials exist", () => {
  const selection = {
    fulfillment: "PHYSICAL",
    taxonomyId: 123,
    shippingProfileId: "456",
    readinessStateId: "789",
  };
  const blockers = listingConfigurationBlockers(listing, selection);
  assert.deepEqual(blockers, []);
  assert.equal(configuredListingStatus(listing, blockers), "READY");

  const withoutImages = { ...listing, assets: [] };
  const blocked = listingConfigurationBlockers(withoutImages, selection);
  assert.ok(blocked.includes("listing_images_missing"));
  assert.equal(configuredListingStatus(withoutImages, blocked), "CONFIG");
});

test("existing Etsy draft identity is preserved when canonical configuration is saved", () => {
  const existing = { ...listing, etsyListingId: "123456789", status: "DRAFT_CREATED" };
  assert.equal(configuredListingStatus(existing, []), "DRAFT_CREATED");
});

test("verified configuration writer uses live GET checks and only mutates WizardOS", () => {
  const writer = source("lib/warlock-commerce/etsy-config-writer.ts");
  assert.match(writer, /seller-taxonomy\/nodes/);
  assert.match(writer, /shipping-profiles\//);
  assert.match(writer, /readiness-state-definitions\//);
  assert.match(writer, /method:\s*"GET"/);
  assert.match(writer, /spellmarkListing\.update/);
  assert.match(writer, /externalEtsyMutation:\s*false/);
  assert.doesNotMatch(writer, /method:\s*"(?:POST|PUT|PATCH|DELETE)"/);
  assert.doesNotMatch(writer, /executeEtsyDrafts|syncPhysicalListingToPrintful/);
});

test("existing Etsy listing mismatches are refused instead of silently reconciled", () => {
  const writer = source("lib/warlock-commerce/etsy-config-writer.ts");
  assert.match(writer, /existing_etsy_listing_not_draft/);
  assert.match(writer, /existing_etsy_taxonomy_mismatch/);
  assert.match(writer, /existing_etsy_shipping_profile_mismatch/);
  assert.match(writer, /existing_etsy_readiness_state_mismatch/);
});

test("MCP configuration action requires explicit confirmation and is not a commerce draft write", () => {
  const server = source("lib/warlock-mcp/server.ts");
  assert.match(server, /"configure_etsy_listing"/);
  assert.match(server, /confirmConfiguration:\s*z\.literal\(true\)/);
  assert.match(server, /configurationWriteAnnotations/);
  assert.match(server, /destructiveHint:\s*false/);
  assert.match(server, /idempotentHint:\s*true/);
});


test("verified configuration accepts Etsy profile IDs beyond JavaScript safe integer range", () => {
  assert.deepEqual(validateEtsyConfigurationSelection({
    fulfillment: "PHYSICAL",
    taxonomyId: 123,
    shippingProfileId: "9223372036854775807",
    readinessStateId: "9007199254740993",
  }), []);
});

test("schema stores Etsy fulfillment profile IDs as text instead of PostgreSQL int4", () => {
  const schema = source("prisma/schema.prisma");
  assert.match(schema, /shippingProfileId\s+String\?/);
  assert.match(schema, /readinessStateId\s+String\?/);
  const migration = source("prisma/migrations/20260926120000_etsy_profile_ids_text/migration.sql");
  assert.match(migration, /shippingProfileId\" TYPE TEXT/);
  assert.match(migration, /readinessStateId\" TYPE TEXT/);
});
