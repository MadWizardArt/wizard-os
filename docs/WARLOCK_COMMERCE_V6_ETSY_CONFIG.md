# Warlock Commerce v6 — Etsy Configuration Discovery

Warlock v6 adds a read-only discovery step for the Etsy configuration values required before any draft execution can be enabled.

## MCP tool

`inspect_etsy_configuration`

Inputs:
- exactly one of `productId` or `title`,
- optional `taxonomyQuery`.

The tool never creates, updates, or publishes an Etsy resource.

## Data returned

For the authenticated Spellmark Etsy shop, the tool reads:

- shop shipping profiles,
- shop processing/readiness profiles,
- Etsy seller taxonomy,
- the existing Etsy physical listing when the canonical manifest already has an Etsy listing ID.

For the selected Spellmark product it also reports:

- canonical taxonomy ID,
- canonical shipping profile ID,
- canonical readiness/processing profile ID,
- whether each required value is still unresolved.

## Taxonomy candidates

Seller taxonomy candidates are ranked locally from Etsy's read-only taxonomy tree.

The ranking is advisory only. The response always returns:

`autoSelected: false`

Warlock does not silently bind an Etsy category.

## Existing OAuth permissions

The existing Etsy OAuth grant already requests:

- `listings_r`
- `listings_w`
- `shops_r`
- `shops_w`
- `transactions_r`

The new inspector only uses read operations and the existing `shops_r` / listing-read permissions.

## Safety boundary

This phase does not:
- change a Spellmark listing manifest,
- change an Etsy shipping profile,
- create or update an Etsy processing profile,
- change Etsy taxonomy,
- create a listing,
- publish a listing,
- enable `WARLOCK_COMMERCE_WRITE_MODE=draft`.

The next step after inspection is to explicitly choose the real taxonomy, shipping profile, and readiness-state IDs for Volans and store those values in the canonical listing manifest before running the full preflight.
