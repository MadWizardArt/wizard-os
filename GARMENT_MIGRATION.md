# Existing garment blank migration — version 2

Etsy requires at least one enabled offering, so disabling every offering is not a
valid way to pause a garment migration. Version 2 temporarily deactivates the
existing active listing, verifies state `inactive`, then updates valid enabled
inventory and description. It preserves listing identity, retained variant IDs,
prices, quantities, processing profiles, images and unrelated digital listings.
No blank, brand, color, price or placement is hardcoded. No schema migration,
new listing publication or order placement is included.

## Owner-reviewed sequence

1. Identify the product and physical variants with `get_product`. Resolve exact
   target catalog IDs, colors and sizes through the Printful catalog tools.
2. `preview_garment_migration` takes productId, approved revised description and
   the complete target edition set. Retain every existing physical variantId
   exactly once, with sourceVariantId equal to variantId. For a new color/size,
   omit variantId and select an existing sourceVariantId whose retail price,
   quantity and processing profile will be copied. Retained SKUs stay unchanged;
   new editions receive deterministic SKUs. Single custom Edition property 513
   derives `Color / Size`; separate properties require exact propertyValues.
   Removing editions or changing prices is outside this operation.
3. Show the exact version-2 preview to the owner. It includes
   `availabilityStrategy: INACTIVE_LISTING`, enabled inventory, description,
   catalog targets, preserved prices/quantities and preliminary base quotes.
   Explain that the whole existing physical listing becomes temporarily
   unavailable. Preview expires in 15 minutes. Base quotes exclude extra placements.
4. `apply_garment_migration` requires saved previewId, productId,
   confirmMigration:true, confirmTemporaryUnavailability:true and the NEW
   confirmTemporaryDeactivation:true. It records durable phases, patches only
   state:inactive, verifies the original inventory and protected fields, then
   writes the approved enabled inventory and description. Canonical blank
   mappings and MIGRATION_PENDING are saved only after exact readback. Old
   production quotes are invalidated. No supplier artwork is changed at this step.
5. Wait for Etsy → Printful import and use `check_printful_import`. Added colors
   may require the existing store refresh/import process. Printful documents that
   inactive listings sync once daily, limited to the first 1,000 listings. Do not
   reactivate an unverified garment just to accelerate import. Sold-out listings
   do not sync, so zeroing quantities is not this workflow's strategy.
6. Create `preview_printful_placements` for every edition on the new blank with
   explicit approved asset IDs, print areas and pixel positions. Inactive Etsy
   listings are accepted ONLY when the matching canonical physical listing is
   MIGRATION_PENDING. Show the saved placement preview to the owner before
   `apply_printful_placements`. Catalog variant and exact files are saved together;
   old placements are not automatically copied. The pending status is preserved.
7. Verify the actual garment/mockup appearance and revise Etsy photos through the
   existing approved listing-image tools as needed. API sync is not visual review.
8. `inspect_garment_migration` reports listingState, actual availability,
   description match and fresh inventory fingerprint. Enabled offerings on an
   inactive listing are correctly reported as unavailable.
9. `enable_migrated_garment` requires that fingerprint, saved previewId,
   confirmVisualReview:true, confirmAvailability:true and the NEW
   confirmExistingListingReactivation:true. This is explicit authorization to
   restore only this previously active listing; it must be withheld while a
   no-publication/no-reactivation restriction applies. All-edition saved placement
   evidence, configured supplier files, fresh combined quotes and margins must
   pass before activation. Inventory remains untouched; only state:active is
   patched. Inventory, description and supplier evidence are checked afterward.
   Draft, expired, sold-out, foreign or changed listings are never activated.

## Recovery

Intent phases distinguish DEACTIVATION_STARTED, DEACTIVATION_VERIFIED,
INVENTORY_STARTED and DESCRIPTION_STARTED. If deactivation times out but exact
readback shows an inactive unchanged source, an explicit same-preview retry can
continue without repeating deactivation. An uncertain inventory PUT is never
replayed automatically. Saved target inventory is verified and staging can finish
without another PUT. Description writes are restricted to the approved exact copy.

For rejected/uncertain inventory with unchanged original source, call
`inspect_garment_migration` using the failed previewId. Confirm
`confirmUnchangedSourceResolution:true` only after the returned complete live
source match. This records resolution under product/variant locks and performs
no Etsy or supplier writes. If still active, the old intent becomes
NO_CHANGE_VERIFIED and a fresh approved preview is required. If version 2 has
already deactivated the listing, resolution records DEACTIVATION_VERIFIED and
allows an explicit SAME-preview resume. Any partial change or drift blocks it.

Version-1 all-disabled previews are never reinterpreted as deactivation approval.
Resolve their unchanged active source, then generate a fresh version-2 preview.
Legacy discarded Etsy rejection text cannot be reconstructed. New inventory,
description and state failures expose bounded sanitized supplierError fields;
credentials, raw bodies, headers and private URLs are omitted.

There is no automatic rollback or activation on failure. A failure after an
activation request may leave the listing active; inspect before retrying. State
restoration is idempotent: a retry verifies the same already-active target and
current supplier evidence without another activation PATCH. Etsy/Printful lack
an atomic conditional transaction; fresh snapshots, locks, exact readback and
owner confirmations limit but cannot eliminate external operator races.

## Provider references

- Etsy deactivation preserves the listing and makes it unavailable:
  https://help.etsy.com/hc/en-us/articles/360000336187-How-to-Deactivate-a-Listing
- Etsy state definitions:
  https://developers.etsy.com/documentation/essentials/definitions/
- Printful inactive and sold-out import behavior:
  https://help.printful.com/hc/en-us/articles/50262491807889-Why-don-t-all-of-my-Etsy-products-show-up-on-Printful
