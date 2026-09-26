# Warlock Commerce v4 — Canonical Etsy Listing Manifests

Warlock v4 makes Etsy listing configuration first-class product data instead of leaving it in one-off release routes, notes, or transient forms.

## Product hierarchy

One `SpellmarkProduct` remains the artwork identity.

It may now own at most:
- one `PHYSICAL` `SpellmarkListing`,
- one `DIGITAL` `SpellmarkListing`.

Variants remain the source of pricing and Printful catalog mappings. Assets remain the source of stored files.

## SpellmarkListing

Each listing manifest owns:
- fulfillment type,
- Etsy title,
- description,
- tags,
- taxonomy ID,
- physical shipping profile ID,
- physical readiness/processing state ID,
- quantity,
- who-made / when-made metadata,
- supply and auto-renew flags,
- Etsy listing ID once one exists,
- configuration lifecycle status.

The exact AI-assistance disclosure is still applied by the outbound Etsy policy helper rather than duplicated manually into every stored description.

## Listing assets

`SpellmarkListingAsset` maps an existing `SpellmarkAsset` into one listing with:
- `kind=image` or `kind=customer_file`,
- explicit ordering position.

This lets physical and digital listings use different imagery while still sharing the same underlying product assets.

Physical listings cannot receive customer-download-file links.

## Execution gate

Warlock now blocks draft execution if the fulfillment has no canonical listing manifest.

For each required listing:
- title must exist,
- taxonomy must be configured,
- at least one image must be assigned,
- physical listings require shipping + readiness/processing profiles,
- digital listings require at least one customer file,
- manifest status must be READY (or a later execution status),
- outbound copy always includes the canonical AI-assistance disclosure.

## Volans migration

The migration seeds only data already established in the repository:
- the existing Volans physical listing identity/copy/tags,
- `Volans Aethereus — Digital Version` as the canonical digital title.

Unknown Etsy taxonomy, shipping, and readiness IDs are intentionally left null. Warlock will block automation until real values are configured.

## Safety

The listing-manifest API only changes WizardOS canonical configuration.

It does not contact Etsy or Printful and cannot publish anything.

External draft mutation remains controlled separately by `WARLOCK_COMMERCE_WRITE_MODE`.
