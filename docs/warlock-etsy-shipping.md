# Etsy Shipping Manager

Warlock tools:

- `inspect_etsy_shipping_profiles`: read all shop profiles and paginate active, draft, inactive, sold-out and expired listings; exclude digital listings; group physical listings by profile and expose US rates and blockers. Removed listings are outside the audit.
- `preview_etsy_shipping_change`: save a ten-minute review for one canonical physical product. Provide `productId`, `sourceProfileId`, optionally `targetProfileId` for reuse or `title` for a new profile. Existing listings must use their current live source profile. A future product can select a verified source profile with owner review of its applicability.
- `apply_etsy_shipping_change`: require `productId`, `previewId`, and `confirmShippingChange:true` after explicit owner approval of the displayed comparison. Requires `WARLOCK_COMMERCE_WRITE_MODE=draft`, including for active listings.

Show source/replacement profiles, first-item and additional-item costs, currency, delivery service, exact destinations and affected listing before requesting approval. Never infer consent from the request to implement this capability. Audit groupings do not authorize bulk edits. Process individually approved previews for each product, reusing the same compatible target profile when appropriate.

## Guarantees and boundaries

Rates come from an explicit US destination on a live manual Etsy profile. The manager accepts no caller-entered prices. Zero is valid only when explicitly present in verified Money fields. Currency, postal origin, delivery service, source profile, canonical product and live listing are checked. Missing evidence, calculated profiles and profiles with shipping upgrades are blocked for manual review. Calculated shipping cannot be created through Etsy's API; upgrades are blocked rather than silently removed.

New profiles are separate US-only copies, preserving verified US costs, postal origin and delivery settings. Shared source profiles are never edited. Reused profiles must have exactly one US destination and compatible costs, currency, origin and service. Existing orders and Printful fulfillment records are outside all write paths.

The only listing PATCH field is `shipping_profile_id`; no publication, order, inventory or retail-price writes occur. The manager reads both profile and listing back before recording success, then saves the verified `shippingProfileId` on the canonical physical listing. New artwork and garment draft creation use this field through the existing pipeline. Each different product still needs a compatibility and owner review; supplier shipping prices are not inferred from product type.

Approval and outcomes are recorded in `SpellmarkJournal`, with no schema migration. Canonical product operations share the existing product advisory lock. A durable SENDING record is committed before external mutations. A successful profile creation records its ID immediately before assignment. Uncertain POST/PATCH outcomes return NEEDS_REVIEW. Retry the same preview to verify only; it never repeats an uncertain write or automatically rolls back. Unknown creation outcomes need manual reconciliation against Etsy before a newly approved operation. Success retries return timestamped historical evidence, not a fresh claim about current Etsy state.

## API and permissions

Verified against Etsy's official OpenAPI schema at https://www.etsy.com/openapi/generated/oas/3.0.0.json and https://developers.etsy.com/documentation/reference/.

- GET `/shops/{shop_id}/shipping-profiles` and individual profiles: `shops_r`.
- POST `/shops/{shop_id}/shipping-profiles`: `shops_w`.
- GET `/shops/{shop_id}/listings`: `listings_r`.
- PATCH `/shops/{shop_id}/listings/{listing_id}`: `listings_w`.

The existing owned-shop allowlist and encrypted Etsy grant are reused. If the stored Etsy grant lacks a required scope, Etsy rejects the request; reconnect Etsy with those scopes. No live shop mutation is part of implementation verification.

Validation: `node --experimental-strip-types --test tests/warlock-etsy-shipping.test.mjs`; CI also runs this suite. It exercises rate preservation, source/target drift, active/draft assignment, future product reuse, digital/ownership rejection, disabled writes, expiry, audit pagination, uncertain POST/PATCH outcomes and database-finalization recovery.
