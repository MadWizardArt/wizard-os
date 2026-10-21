# Import an existing Etsy draft into Warlock

This is retroactive Etsy-first intake: the owner created the draft in Etsy, and
Warlock imports its reviewed copy, category, prices and variant set. It does not
require inventory to match an old product and does not create another Etsy draft.

1. Call `preview_etsy_draft_import` with `etsyListingId`, `productId` and
   `expectedEtsyListingId`. For a missing canonical product, both product/source IDs
   are explicitly null; an optional collection applies only to a new product.
   For an existing product, use its ID and exact saved Etsy listing ID for this
   fulfillment. A different saved source must return a fresh 404 after shop access
   is verified. No preliminary intake or matching of old variant SKUs is needed.
2. Show the exact saved preview to the owner: old and proposed listing copy,
   category, prices, complete Etsy variant options, quantities, enabled states,
   replaced inventory, and warnings. Previews expire in ten minutes.
3. After approval, call `apply_etsy_draft_import` with that `previewId` and
   `confirmImport:true`. It rereads the owned draft and inventory, checks canonical
   state, duplicate target links and expiry, then commits canonical changes atomically.
4. Use the returned product ID with `get_product` and `attach_product_file`
   (hero/mockup with explicit fulfillment). Existing product-owned mockups remain
   available. `inspect_etsy_listing_images` then supplies current ranks and IDs;
   perform the separately approved `update_etsy_listing_image` on this same draft.
   Never call draft creation just to send mockups to an imported draft.

For an existing product, product metadata and files stay intact; only the selected
fulfillment's listing copy/configuration and entire variant set are replaced from
observed Etsy data. The other fulfillment is preserved. Replaced copy, prices,
variants and supplier evidence are archived in the existing product journal.
Old Printful IDs/quotes are cleared rather than assigned to unrelated new variants.
The draft stays DRAFT_CREATED; supplier mapping, placements, quotes and visual
review remain separate. Disabled offerings and zero quantities remain visible in
import evidence; they are never silently enabled. Missing/repeated SKUs are allowed
because each imported physical row uses its actual unique Etsy product ID.

Only owned drafts and complete supported USD inventory are accepted. Multi-offering
products and unsupported/malformed prices return explicit errors. Digital imports
use the observed delivery mode and price, with no canonical production partner.
The Etsy listing response does not expose production partner assignment, Ads, or
structured digital creation state; these are explicitly unverified. Existing
physical partner intent is retained, not claimed as remote observation. Imported
copy stays exact. Missing required AI disclosure is reported as a correction
requirement before publication, not silently added to Etsy or hidden.

The import preview uses a small approval table in the existing canonical database
because a new product does not exist yet. An unapproved preview creates no product,
listing, variant, blob or external record. Apply stores approved evidence and archive
in the product journal, and records the result atomically for idempotent retries.
Completed retries return historical evidence; inspect current canonical state.

No Etsy/Printful mutations, uploads, deletion, publication, orders, image-identity
inference or new integration bridge occur during preview/import. All subsequent
writes use the established commerce tools and their existing approval guards.

## Restore physical mappings after draft import

After importing an existing physical draft, resolve the exact approved catalog
colors/sizes and call `configure_printful_variant` for each returned canonical
variant ID. A fully unmapped variant with no sync ID may receive its initial
catalog/store mapping even though it already has an Etsy listing ID.

This exception requires saved draft-import evidence plus a fresh read of the
owned physical Etsy draft and its exact product ID, SKU, option label, enabled
offering and approved USD price. Canonical listing locks and an optimistic
variant guard reject concurrent changes. Partial/existing supplier mappings and
synced variants cannot be remapped through this exception. Active imports remain
outside this draft recovery path. Failed verification leaves mappings and quotes
unchanged. No Etsy or Printful writes occur; placement batch approval, production
application and supplier visual verification remain separate steps.
