# Post-draft listing photos

The full intake lock remains in place after Etsy/Printful execution. Existing
products can now receive presentation images without reopening intake or rerunning
draft execution. This applies to all products, including future garments.

1. Use `attach_product_file` with the existing product ID, a native attachment,
   role `hero` or `mockup`, explicit fulfillment, and `confirmAttachment: true`.
   This stages a canonical product-owned asset only. It does not change Etsy or
   replace the current canonical listing image link. Keep the returned asset ID.
2. Call `inspect_etsy_listing_images` for the product and fulfillment. Review the
   selected image and exact destination rank with the owner.
3. Call `update_etsy_listing_image` with the asset ID, rank, current image ID
   (`null` only for the next append slot), inspection fingerprint, unique
   request ID, and `confirmImageWrite: true`. Writes require the existing
   `WARLOCK_COMMERCE_WRITE_MODE=draft` setting. Photo updates support draft and
   active listings; they do not activate a listing.
4. Refresh inspection after every successful update before preparing the next.
   Each call changes one photo. There is no atomic multi-photo update.

Only the Etsy listing images endpoint is writable through this operation. Prices,
inventory, digital delivery files, production assets and Printful placements are
not written. Canonical image links are updated only after supplier readback
confirms the returned image ID at the intended rank and all unrelated image IDs
and ranks remain unchanged. Visual mockup verification remains a separate check.

A journal intent is committed before upload. A returned remote image ID is saved
before readback. Retrying the same request ID verifies a recorded upload without
uploading again. If no remote ID was recorded, the upload outcome is uncertain:
inspect Etsy visually before authorizing a fresh request. Never blindly create a
new request ID to bypass this response. A four-minute per-listing lease prevents
concurrent image operations; expired operations cannot begin new uploads.

Etsy does not provide an atomic conditional image upload. External edits between
inspection and upload remain possible. Fresh pre-write inspection narrows this
window, and exact post-write readback fails closed to `NEEDS_REVIEW` when another
slot changed. Do not automatically undo an uncertain result or claim it verified.

No schema migration is required. Assets and operation records use the existing
asset, listing-image link, and journal models. General intake and production-file
attachment remain locked after execution. This patch does not itself upload any
live product images, publish listings, or place orders.
