# Warlock Commerce v5 — Draft Execution

Warlock v5 adds the first generic external write pipeline while keeping publication and order placement outside automation.

## Safety boundary

External writes remain disabled unless:

`WARLOCK_COMMERCE_WRITE_MODE=draft`

The MCP tool also requires the explicit input:

`confirmDraftWrite: true`

There is no publish write mode. The v5 code does not activate Etsy listings, create Printful orders, confirm orders, or incur fulfillment charges.

## Execution sequence

`execute_draft_product` performs:

1. Load the canonical Spellmark product.
2. Validate the package.
3. Evaluate compliance and contribution-margin gates.
4. Run live read-only Printful store/catalog/availability preflight for physical variants.
5. Create or update the canonical Etsy physical and/or digital draft.
6. Refuse to modify an Etsy listing whose current Etsy state is not `draft`.
7. For physical listings, replace Etsy inventory with the complete canonical physical variant set.
8. Upload only listing assets that do not already have a persisted Etsy remote ID.
9. Persist Etsy listing, product/SKU, image, and customer-file identifiers.
10. Ask Printful for the ecommerce sync product using the Etsy listing ID as the external product ID.
11. If Printful has not finished importing the Etsy draft, set `WAITING_PRINTFUL` and return safely.
12. Once every imported Printful sync variant can be matched, configure all of them with the approved catalog variant and a short-lived signed master-art URL.
13. Persist Printful sync product/variant IDs.
14. Stop at `READY_FOR_HUMAN_REVIEW`.

## Idempotency

Warlock persists:

- Etsy listing ID per listing manifest,
- stable Etsy SKU per fulfillment variant,
- Etsy inventory product ID when returned,
- Etsy image/file remote ID per listing asset,
- Printful sync product ID,
- Printful sync variant ID.

On a repeated run:

- an existing Etsy listing is verified to still be a draft and then updated,
- the full physical inventory set is rewritten deterministically,
- already-uploaded Etsy assets are skipped,
- known Printful sync variants are reused,
- no second listing should be created while a canonical Etsy listing ID exists.

If a stored Etsy listing ID no longer resolves, execution fails instead of silently creating a replacement.

## Etsy inventory convention

Spellmark physical print listings currently use one custom Etsy variation property:

- property ID: `513`
- property name: `Edition`

The canonical variant label becomes the Etsy variation value.

Every inventory update sends the entire physical variant set, matching Etsy's inventory update contract.

## Printful synchronization

Warlock uses the Ecommerce Platform Sync API rather than the Printful Products API for Etsy-connected listings.

The physical Etsy draft is created first. Printful imports it asynchronously. Warlock then resolves:

`GET /sync/products/@{etsyListingId}`

If the imported product or all expected variants are not present yet, the run ends in `WAITING_PRINTFUL_IMPORT`. A later execution safely rechecks the same canonical listing.

When all variants exist, Warlock updates each imported sync variant using:

`PUT /sync/variant/{syncVariantId}`

with:
- the approved Printful catalog variant,
- stable SKU,
- retail price,
- `is_ignored=false`,
- a short-lived private Vercel Blob URL for the approved master artwork.

## Volans continuity

The migration preserves the established Volans physical SKUs:

- 8×10 unframed: `SM-OWL-P1-V4463`
- 11×14 unframed: `SM-OWL-P1-V14125`
- 11×14 black framed: `SM-OWL-P2-V14292`

Existing package assets are assigned conservatively:

- physical listing: hero + mockup assets,
- digital listing: hero assets + customer files,
- physical mockups are not automatically assigned to the digital listing.

Etsy taxonomy, shipping profile, and readiness/processing IDs are still never guessed. The commerce gates block execution until real canonical values are configured.

## Next phase

After v5 is proven in disabled mode, the next layer is Printful mockup generation/retrieval and final listing-review reporting.

Enabling `draft` mode should happen only after reviewing a real product's execution plan and canonical listing manifests.
