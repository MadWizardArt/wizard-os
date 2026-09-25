-- Cabinet of Curiosities / Volans Aethereus production release.
-- User approved the master and released the print-quality hold on 2026-09-25.
INSERT INTO "SpellmarkProduct" (
  "id","title","collection","description","artworkReference","status","notes","createdAt","updatedAt"
) VALUES (
  'spellmarkowlvolansv1',
  'Volans Aethereus — The Owl',
  'Cabinet of Curiosities',
  'Barn owl art print with a restrained illuminated-manuscript treatment, parchment ground, celestial ornament and botanical flourishes.',
  'APPROVED_OWL_MASTER_EXACT_UPLOAD.png',
  'LISTING',
  'PRODUCTION APPROVED 2026-09-25. Locked master. Every listing/mockup must show this exact artwork. Physical framed edition must use the available black Printful frame only; decorative gilded frames are not the sold product.',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO UPDATE SET
  "title"=EXCLUDED."title",
  "collection"=EXCLUDED."collection",
  "description"=EXCLUDED."description",
  "artworkReference"=EXCLUDED."artworkReference",
  "status"=EXCLUDED."status",
  "notes"=EXCLUDED."notes",
  "updatedAt"=CURRENT_TIMESTAMP;

INSERT INTO "SpellmarkVariant" (
  "id","productId","fulfillment","label","printfulProductId","printfulVariantId","printfulStoreId",
  "etsyListingId","retailPriceCents","productionBaseCents","productionQuotedAt","currency","createdAt","updatedAt"
) VALUES
(
  'spellmarkowldigitalv1','spellmarkowlvolansv1','DIGITAL',
  'Digital download — 11×14 + 8×12',NULL,NULL,NULL,
  NULL,750,NULL,NULL,'USD',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
),
(
  'spellmarkowlunframedv1','spellmarkowlvolansv1','PHYSICAL',
  'Enhanced Matte Paper Poster — 11×14 in',1,14125,12562279,
  NULL,3500,983,'2026-09-23 19:31:53+00','USD',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
),
(
  'spellmarkowlframedv1','spellmarkowlvolansv1','PHYSICAL',
  'Enhanced Matte Paper Framed Poster — Black / 11×14 in',2,14292,12562279,
  NULL,7000,3069,'2026-09-23 19:27:48+00','USD',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO UPDATE SET
  "productId"=EXCLUDED."productId",
  "fulfillment"=EXCLUDED."fulfillment",
  "label"=EXCLUDED."label",
  "printfulProductId"=EXCLUDED."printfulProductId",
  "printfulVariantId"=EXCLUDED."printfulVariantId",
  "printfulStoreId"=EXCLUDED."printfulStoreId",
  "retailPriceCents"=EXCLUDED."retailPriceCents",
  "productionBaseCents"=EXCLUDED."productionBaseCents",
  "productionQuotedAt"=EXCLUDED."productionQuotedAt",
  "currency"=EXCLUDED."currency",
  "updatedAt"=CURRENT_TIMESTAMP;
