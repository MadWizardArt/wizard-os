# Clear stale Etsy links or adopt existing drafts

Use `preview_etsy_listing_link` followed by `apply_etsy_listing_link`. Both operate
inside canonical WizardOS/Warlock and use the existing GET-only Etsy reconciliation
transport. They never create, delete, edit, publish or upload an Etsy/Printful
listing, place orders, or remove a product-owned file.

## Missing Etsy listing

1. Read `get_product` for the canonical product, fulfillment and currently saved
   `etsyListingId`.
2. Preview with `productId`, `fulfillment`, `expectedEtsyListingId` set to that exact
   ID, and `targetEtsyListingId:null`.
3. The preview verifies authenticated `listings_r` access to the configured shop
   through `getListingsByShop` (`state=draft`, `limit=1`), then requires the old
   listing's GET to return **404**. A 404 is reported as **NOT_FOUND**; it does not
   independently prove the listing was deleted. All existing source states,
   including inactive, sold-out, expired and removed, block cleanup. Auth failures,
   permission errors, rate limits and server failures are not deletion evidence.
4. Show the exact saved preview to the owner. Apply that `previewId` only after
   approval with `confirmListingLink:true`. Previews expire after ten minutes.
5. Apply repeats the live checks and canonical identity checks under database locks.
   It archives prior linkage/evidence in the existing product journal and clears
   the selected listing's Etsy ID, Printful sync IDs, remote asset associations,
   observations and physical production quote evidence atomically. The listing
   configuration row returns to CONFIG. Other fulfillment remains untouched.

The stale Etsy reference is removed, while the canonical product, reusable assets,
copy, retail prices, listing settings and Printful catalog mappings remain. This is
not an automatic product deletion or a claim that Printful's old remote records
were removed. Inspect and handle any old supplier records separately.

## Link a replacement or manually created draft

Use the same preview operation with an explicit `targetEtsyListingId` instead of
null. If Warlock has no saved Etsy ID, pass `expectedEtsyListingId:null`. If the
product itself does not yet exist, use normal `intake_product` to create its
canonical package before linking; this operation does not invent a product from an
unreviewed remote listing.

The target must be an unlinked draft in the configured shop with the exact canonical
listing title, taxonomy and fulfillment type. Digital price and delivery mode must
match. Physical inventory must have exactly the canonical variant count, one enabled
non-deleted offering per variant, unique non-empty SKUs and matching USD prices.

Unique exact canonical SKU matches can build the preview. Otherwise inspection
returns `NEEDS_VARIANT_MAPPING`, canonical variant IDs and the target's observed
inventory/color/size choices, **without an applicable approval preview**. Supply a
complete explicit `variantMappings:[{variantId,etsyProductId}]` selection and preview
again. Similar prices, colors, sizes or labels alone are never automatic matches.
Review the canonical labels against Etsy option values in the exact preview.

Apply rechecks the saved target metadata/inventory fingerprints, refuses a target
already linked to any canonical listing/variant, and atomically adopts only the
reviewed target ID and variant identities. Status becomes DRAFT_CREATED. Supplier
and visual verification remain pending. Old supplier/asset verification is cleared;
existing canonical asset selection is retained, with no inferred remote-image mapping.

Now use `inspect_etsy_listing_images`, approved attachment/update tools, configuration
inspection and the normal supplier placement/quote workflow. Do not create a duplicate
Etsy draft. Exact apply retries return historical evidence and do not repeat writes;
read `get_product` for the current link.

The existing authenticated bookkeeping API also supports POST actions `PREVIEW_LINK`
and `APPLY_LINK`, with the same arguments and guards. No alternative bridge or state
store is introduced. Preview/result evidence is available in `get_product_bookkeeping`.

## Validation

Mocked transport and transaction tests cover missing versus extant sources, auth
failures, target ownership/state/product mismatches, complete physical mappings,
digital delivery/price checks, expired or stale approvals, duplicate linkage,
source reappearance, idempotent retries, sibling preservation and rollback. CI
also checks MCP authorization and confirmation rejection. No live cleanup,
adoption, Etsy/Printful edits, file uploads, publication or orders are performed by
the coding session.
