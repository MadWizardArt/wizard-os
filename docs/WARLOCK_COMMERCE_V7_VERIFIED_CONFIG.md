# Warlock Commerce v7 — Verified Canonical Etsy Configuration

Warlock v7 closes the gap between read-only Etsy configuration discovery and draft execution.

## Purpose

Before a product can pass the Etsy compliance gate, its canonical listing needs real Etsy configuration values.

The `configure_etsy_listing` MCP action:

1. loads the canonical Spellmark product,
2. verifies the selected Etsy taxonomy ID against the current seller taxonomy,
3. verifies selected physical shipping and processing/readiness profile IDs against the connected Spellmark Etsy shop,
4. refuses conflicting metadata when an Etsy listing already exists,
5. writes the verified IDs to WizardOS only,
6. moves an otherwise-complete canonical listing from `CONFIG` to `READY`.

It does not modify Etsy.

## Explicit confirmation

The MCP action requires:

`confirmConfiguration: true`

The action is idempotent and non-destructive.

## Physical listings

Physical configuration requires:
- taxonomy ID,
- shipping profile ID,
- processing/readiness profile ID.

Shipping and readiness IDs are modeled as numeric strings rather than JavaScript numbers.

Etsy documents those identifiers as 64-bit integers. Keeping them as strings in WizardOS prevents precision loss for values larger than JavaScript's safe-integer range.

The database columns are therefore stored as text.

## Etsy inventory boundary

Etsy's inventory API still expects `readiness_state_id` as an integer in JSON.

Warlock keeps the value as a string internally and serializes only that field as an unquoted integer literal at the final Etsy inventory request boundary. The value is never converted through floating-point `Number`.

## Existing Etsy listings

If the canonical listing already has an Etsy listing ID, Warlock reads that listing first.

Configuration is refused when:
- the Etsy listing is not in `draft` state,
- the live taxonomy conflicts with the selected taxonomy,
- the live shipping profile conflicts with the selected profile,
- the live readiness profile conflicts with the selected profile.

Warlock never silently edits Etsy to resolve those mismatches.

## Digital listings

Digital configuration requires a taxonomy ID only.

Shipping and readiness profile IDs are rejected for digital listings.

## Status transition

After successful verification:
- a new canonical listing becomes `READY` only when its required listing assets and fulfillment configuration are complete,
- a canonical listing with an existing Etsy draft remains `DRAFT_CREATED`,
- post-Printful states remain locked from this configuration action.

## Safety boundary

This action may update the WizardOS database.

It does not:
- create or update an Etsy listing,
- change an Etsy shipping profile,
- change an Etsy processing profile,
- create a Printful product,
- place a Printful order,
- publish anything,
- enable `WARLOCK_COMMERCE_WRITE_MODE=draft`.

Draft execution remains a separate, explicitly gated phase.
