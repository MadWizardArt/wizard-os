# Document masters and pre-draft customer-file replacement

`attach_product_file` and `intake_product` accept image, PDF and ZIP masters.
PPTX filenames require a bounded ZIP directory containing the PowerPoint package
entries and are stored with the PowerPoint MIME type. This is a package-structure
check, not a full Office document validator. Legacy binary .ppt files are not
supported. Hero/mockup assets still require images. Printful automatic master
configuration rejects document files; explicit placement validation remains intact.

To replace an approved customer download before draft execution:

1. Read `get_product` and identify the DIGITAL customer-file slot and current asset ID.
2. Call `attach_product_file` with the revised native file, role `customer_file`,
   fulfillment `DIGITAL`, exact `position`, `expectedAssetId` set to the current
   canonical file asset ID, `confirmReplacement: true`, and `confirmAttachment: true`.
   The same replacement fields are supported on an `intake_product` asset.
3. Read back the canonical package and rerun validation before draft execution.

The slot link changes atomically with a journal entry. The original asset is not
deleted or overwritten. Retries reusing the exact new file are safe; stale slot
expectations fail. Price, license and approval records are not modified by the
attachment call. Existing storage-retention rules still apply.

This operation does not update Etsy files. It rejects products after Etsy/Printful
execution, remote-synced file slots, made-to-order downloads, and replacements of
hero/mockup slots. Existing post-draft listing-image tools remain separate. No
migration, listing publication, order, or automatic product execution is included.
