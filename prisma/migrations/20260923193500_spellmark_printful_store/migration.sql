-- Keep Etsy/Spellmark fulfillment distinct from Mad Wizard Art and other Printful stores.
ALTER TABLE "SpellmarkVariant" ADD COLUMN "printfulStoreId" INTEGER;
