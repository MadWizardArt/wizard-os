-- Etsy shipping-profile and readiness-state IDs are documented as int64.
-- Store them as text so JavaScript and JSON never truncate large external IDs.
ALTER TABLE "SpellmarkListing"
  ALTER COLUMN "shippingProfileId" TYPE TEXT USING "shippingProfileId"::text,
  ALTER COLUMN "readinessStateId" TYPE TEXT USING "readinessStateId"::text;
