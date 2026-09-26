-- Warlock Commerce v4: make physical and digital Etsy listing configuration canonical.
CREATE TABLE "SpellmarkListing" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "fulfillment" "SpellmarkFulfillment" NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "tagsJson" TEXT NOT NULL DEFAULT '[]',
  "taxonomyId" INTEGER,
  "shippingProfileId" INTEGER,
  "readinessStateId" INTEGER,
  "quantity" INTEGER NOT NULL DEFAULT 999,
  "whoMade" TEXT NOT NULL DEFAULT 'i_did',
  "whenMade" TEXT NOT NULL DEFAULT '2020_2026',
  "isSupply" BOOLEAN NOT NULL DEFAULT false,
  "shouldAutoRenew" BOOLEAN NOT NULL DEFAULT true,
  "etsyListingId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'CONFIG',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SpellmarkListing_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SpellmarkListingAsset" (
  "id" TEXT NOT NULL,
  "listingId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'image',
  "position" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SpellmarkListingAsset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SpellmarkListing_productId_fulfillment_key"
  ON "SpellmarkListing"("productId", "fulfillment");
CREATE INDEX "SpellmarkListing_etsyListingId_idx"
  ON "SpellmarkListing"("etsyListingId");
CREATE INDEX "SpellmarkListing_status_idx"
  ON "SpellmarkListing"("status");

CREATE UNIQUE INDEX "SpellmarkListingAsset_listingId_assetId_key"
  ON "SpellmarkListingAsset"("listingId", "assetId");
CREATE UNIQUE INDEX "SpellmarkListingAsset_listingId_kind_position_key"
  ON "SpellmarkListingAsset"("listingId", "kind", "position");
CREATE INDEX "SpellmarkListingAsset_assetId_idx"
  ON "SpellmarkListingAsset"("assetId");

ALTER TABLE "SpellmarkListing"
  ADD CONSTRAINT "SpellmarkListing_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "SpellmarkProduct"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SpellmarkListingAsset"
  ADD CONSTRAINT "SpellmarkListingAsset_listingId_fkey"
  FOREIGN KEY ("listingId") REFERENCES "SpellmarkListing"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SpellmarkListingAsset"
  ADD CONSTRAINT "SpellmarkListingAsset_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "SpellmarkAsset"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed only listing identity/copy we can verify from the existing Volans release.
-- External Etsy taxonomy/shipping/readiness IDs remain null until explicitly configured.
INSERT INTO "SpellmarkListing" (
  "id","productId","fulfillment","title","description","tagsJson","quantity",
  "whoMade","whenMade","isSupply","shouldAutoRenew","etsyListingId","status","createdAt","updatedAt"
)
SELECT
  'spellmarkvolansphysicalv1',
  "id",
  'PHYSICAL'::"SpellmarkFulfillment",
  'VOLANS AETHEREUS — The Sky Wanderer | Medieval Manuscript Barn Owl Art Print | Cabinet of Curiosities',
  E'VOLANS AETHEREUS — The Sky Wanderer is the flagship owl of Spellmark’s Cabinet of Curiosities collection.\n\nA naturalistic barn owl appears within a restrained illuminated-manuscript-inspired folio: parchment texture, celestial ornament, botanical flourishes, and gold-toned printed details. The gold appearance is part of the printed artwork; it is not metallic foil or hand gilding.\n\nChoose one physical edition:\n• 8×10 in unframed Enhanced Matte Paper Poster — $24\n• 11×14 in unframed Enhanced Matte Paper Poster — $28\n• 11×14 in Enhanced Matte Paper Framed Poster with BLACK Printful frame — $69\n\nUnframed editions do not include a frame. The framed edition includes only the available black Printful frame shown in the product imagery. Decorative props are not included.\n\nPrint-on-demand fulfillment through Printful.',
  '["barn owl print","medieval wall art","celestial owl","manuscript art","dark academia decor","owl wall decor","nature illustration","gothic wall art","illuminated art","mystical owl","curiosity cabinet","black framed print","Spellmark"]',
  999,'i_did','2020_2026',false,true,
  (
    SELECT MIN("etsyListingId")
    FROM "SpellmarkVariant"
    WHERE "productId" = 'spellmarkowlvolansv1'
      AND "fulfillment" = 'PHYSICAL'::"SpellmarkFulfillment"
      AND "etsyListingId" IS NOT NULL
  ),
  'CONFIG',
  CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
FROM "SpellmarkProduct"
WHERE "id" = 'spellmarkowlvolansv1'
ON CONFLICT ("productId","fulfillment") DO NOTHING;

INSERT INTO "SpellmarkListing" (
  "id","productId","fulfillment","title","description","tagsJson","quantity",
  "whoMade","whenMade","isSupply","shouldAutoRenew","etsyListingId","status","createdAt","updatedAt"
)
SELECT
  'spellmarkvolansdigitalv1',
  "id",
  'DIGITAL'::"SpellmarkFulfillment",
  'Volans Aethereus — Digital Version',
  "description",
  '[]',
  999,'i_did','2020_2026',false,true,
  (
    SELECT MIN("etsyListingId")
    FROM "SpellmarkVariant"
    WHERE "productId" = 'spellmarkowlvolansv1'
      AND "fulfillment" = 'DIGITAL'::"SpellmarkFulfillment"
      AND "etsyListingId" IS NOT NULL
  ),
  'CONFIG',
  CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
FROM "SpellmarkProduct"
WHERE "id" = 'spellmarkowlvolansv1'
ON CONFLICT ("productId","fulfillment") DO NOTHING;
