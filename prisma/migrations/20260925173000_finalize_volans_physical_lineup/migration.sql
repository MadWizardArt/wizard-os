-- Finalize the physical Volans Aethereus lineup after live Printful catalog verification.
UPDATE "SpellmarkProduct"
SET
  "title" = 'VOLANS AETHEREUS — The Sky Wanderer',
  "status" = 'LISTING',
  "notes" = 'PRODUCTION APPROVED 2026-09-25. Locked master. Physical Etsy lineup: 8×10 unframed $24, 11×14 unframed $28, 11×14 black-framed $69. Every listing image must show the approved master; framed imagery may show only the available black Printful frame as the included frame.',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'spellmarkowlvolansv1';

INSERT INTO "SpellmarkVariant" (
  "id","productId","fulfillment","label","printfulProductId","printfulVariantId","printfulStoreId",
  "etsyListingId","retailPriceCents","productionBaseCents","productionQuotedAt","currency","createdAt","updatedAt"
) VALUES (
  'spellmarkowlunframed8x10v1','spellmarkowlvolansv1','PHYSICAL',
  'Enhanced Matte Paper Poster — 8×10 in',1,4463,12562279,
  NULL,2400,703,CURRENT_TIMESTAMP,'USD',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO UPDATE SET
  "label"=EXCLUDED."label",
  "printfulProductId"=EXCLUDED."printfulProductId",
  "printfulVariantId"=EXCLUDED."printfulVariantId",
  "printfulStoreId"=EXCLUDED."printfulStoreId",
  "retailPriceCents"=EXCLUDED."retailPriceCents",
  "productionBaseCents"=EXCLUDED."productionBaseCents",
  "productionQuotedAt"=EXCLUDED."productionQuotedAt",
  "updatedAt"=CURRENT_TIMESTAMP;

UPDATE "SpellmarkVariant"
SET "retailPriceCents" = 2800, "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'spellmarkowlunframedv1';

UPDATE "SpellmarkVariant"
SET "retailPriceCents" = 6900, "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'spellmarkowlframedv1';
