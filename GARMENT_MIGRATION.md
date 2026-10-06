# Active garment migration

This extends Etsy-first → Printful sync for changing an active listing's blank,
adding colors, and revising its garment description. No garment, brand, product,
color, price, sleeve or placement is hardcoded. No listing publication or orders
are included. No schema migration is needed.

## Operator sequence

1. `get_product` identifies existing physical variant IDs, store and listing.
   Resolve the new blank with `search_printful_catalog` and
   `resolve_printful_catalog`; use exact catalog product/variant IDs, color names
   and sizes returned by Printful.
2. `preview_garment_migration`: provide productId, approved revised description
   and the complete target edition list. Every existing physical variantId must
   occur exactly once. For that target use sourceVariantId equal to variantId.
   To add a color/size, omit variantId and select an existing sourceVariantId;
   its retail price, quantity and processing profile are copied. Existing SKUs
   remain; new editions receive deterministic SKUs in the saved preview.
   A single custom Edition property automatically uses `Color / Size`. Listings
   using separate properties require exact inspected propertyValues. Removing
   existing editions or changing prices is outside this operation.
3. Review the returned description, blank, all colors/sizes, prices, quantities,
   and temporary unavailability with the owner. The preview expires in 15 minutes.
   Default base quotes are preliminary and exclude additional placements.
4. `apply_garment_migration` requires productId, saved previewId,
   confirmMigration:true, and confirmTemporaryUnavailability:true. It updates
   existing Etsy inventory with all target offerings disabled and patches only
   description. It verifies exact target editions and description before saving
   canonical blank mappings and invalidating old production quotes. Unrelated
   digital listings, listing images, prices, tags and fulfillment profiles are
   not written. Prices must already agree between canonical and live Etsy.
5. Wait for Etsy → Printful import and inspect with `check_printful_import`.
   Added editions may require the existing store refresh/import procedure.
   No Printful variants are created outside the Etsy integration. Automatic
   default-master configuration is blocked while status is MIGRATION_PENDING.
6. `preview_printful_placements` uses the new canonical blank for every target
   edition. Submit explicit approved production asset IDs, placement names and
   pixel positions using that blank's print areas. Show the saved preview to the
   owner, then `apply_printful_placements` with approval. This existing operation
   writes the new catalog variant and exact placement files together; no old
   placement is automatically copied to the new garment. Preview quotes include
   the entire planned placement set. Pending migration status survives placement
   application until the separate availability step.
7. Visually inspect revised garment/mockup appearance and refresh Etsy photos
   through the existing confirmed listing-image tools as needed. A successful
   API sync alone is not visual verification.
8. `inspect_garment_migration` returns fresh target inventory fingerprint and
   availability. `enable_migrated_garment` requires this fingerprint, saved
   previewId, confirmVisualReview:true and confirmAvailability:true. It requires
   placement-result evidence covering all editions, current CONFIGURED_SYNC
   quotes, and combined margins. It enables only offerings, verifies inventory,
   rechecks supplier configuration/quotes, and records completion.

## Recovery and limits

A durable intent is committed before inventory or description mutation. If the
external operation or canonical transaction is interrupted, retry the SAME
previewId. Recovery verifies already-saved target inventory and may finish the
exact description and canonical mapping; it never repeats an uncertain inventory
PUT. If no verified target inventory exists, inspect before authorizing a fresh
preview. No rollback or duplicate listing is attempted. Completed application
replays return the historical saved result; inspect for current availability.

Availability writes are idempotent: a retry verifies already-enabled target
inventory, but still checks supplier evidence and quotes. Any mismatch remains
BLOCKED or VERIFY_OR_RETRY_REQUIRED rather than being declared complete.

Etsy does not offer an atomic conditional write spanning inventory, description
and Printful. Fresh snapshots, product locks, exact readback and disabled target
offerings limit inconsistent operation. External operator edits can still occur
between API calls; resolve reported drift through fresh inspection.

The listing itself remains active; its migrated editions become temporarily
unavailable. This is explicitly approved when applying the preview. A blank
change must not be considered complete until availability and supplier checks
pass. Final visual review is an owner attestation, not automated image analysis.
