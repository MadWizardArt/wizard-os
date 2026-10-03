# Printful placement workflow

Etsy request payloads use `type`; returned listings use `listing_type`.
Warlock validates the response field for draft setup, bookkeeping, and active supplier reconciliation. Conflicting, unknown, or mixed listing types are rejected.

For imported physical products requiring multiple print placements:

1. Attach each approved production image to the canonical product as a `master` asset. Use existing imported Etsy/Printful identifiers; do not recreate listings.
2. Call `preview_printful_placements` with the product ID and the complete physical variant set. Each variant specifies exact asset IDs, supported file types, and explicit canvas/image pixel dimensions and offsets. Use the correct supplier print area for each size and placement; never infer it from a promotional mockup. At 300 DPI, 300 pixels correspond to one inch.
3. Show the saved preview and combined production costs to the owner. Approve that exact preview before calling `apply_printful_placements` with its preview ID and `confirmPlacementWrite: true`.
4. Apply rechecks canonical records, Etsy ownership/type, imported identities, current supplier configuration, stock, and combined pricing. It then updates Printful files only and verifies every variant's file MD5, canvas dimensions, DPI, and catalog mapping from provider readbacks. Quotes and verification evidence are retained in product bookkeeping.
5. Inspect Printful visual mockups before declaring the apparel ready. `PLACEMENT_FILES_VERIFIED` verifies the saved production canvases; `physicalPlacementVerification: MANUAL_REVIEW_REQUIRED` remains explicit because the sync API does not expose physical print offsets. `SYNCED` is not proof of final visual placement approval. No listing is published and no order is placed by these tools.

## Positioning contract

The Printful v1 SyncVariant file schema supports source files, placement types, and options. It does **not** document a writable/readable file `position` field. Warlock therefore renders the approved positioning into a transparent PNG at 300 DPI, preserving originals. Artwork fits inside its requested bounding box without distortion. The full canvas represents the approved print area; offsets are baked into its pixels. No unsupported position fields are sent to Printful.

Prepared canvases are registered as `production_canvas` assets and follow existing Warlock retention/Keep rules. Preview and result journal events preserve their source associations and checksums. Originals are never replaced. Previewing requires accessible private storage; a blocked Blob store must be restored before preparing or delivering these canvases.

Previews expire after 15 minutes. Changed source content, prices, options, identifiers, or canonical configuration require a new preview. Partial failures return `NEEDS_REVIEW` with verified variant IDs. The saved application result is replayed on repeated calls using the same preview ID; create a fresh preview to retry. A provider file still processing cannot be reported verified.

Provider references:
- https://developers.etsy.com/documentation/reference/
- https://developers.printful.com/docs/#tag/Ecommerce-Platform-Sync-API

## Recovering imports and uploads

`check_printful_import` now reads every mapped sync variant and returns a `configurations` array. The top-level `IMPORTED` state only establishes identities; `productionVerified` remains false.

- `EMPTY_IMPORT`: no production files (preview images do not count). Confirmed single-master execution may configure it, provided it is not ignored and has no conflicting catalog mapping.
- `PROCESSING`: Printful reports a file as `waiting`. Keep the existing upload and inspect later. Writes are not repeated automatically.
- `NEEDS_REVIEW`: inspect `configurationIssues` for exact fields, such as `files[0].status`, `variant_id`, or `is_ignored`. Existing files, ignored variants and conflicting catalog mappings require an approved placement preview instead of a blind overwrite.
- `CONFIGURED`: valid supplier configuration. This is not proof of approved artwork or physical placement.

After a PUT, verification performs at most three GETs with one-second intervals when files are processing. A persistent pending state remains unverified. A fresh approved preview reuses supplier files only when checksums, dimensions, DPI, catalog mapping, placements and file options match. Derived canvases are reused from canonical storage rather than uploaded again on every preview.

Placement coordinates are **integer pixels at 300 DPI**, not inches. `variantId` and `assetId` are canonical Warlock IDs from `get_product`; sleeve names are `sleeve_right` and `sleeve_left`. Supply every physical variant, each with `files: [{assetId, type, position: {area_width, area_height, width, height, top, left}}]`. `limit_to_print_area` defaults to true and cannot be disabled. The source artwork size alone does not establish a garment's print-area dimensions.

Invalid placement arguments return `printful_placement_arguments_invalid` with field paths before SDK validation. No request values, source URLs or credentials are logged. A rejection on the ChatGPT side before an HTTP request reaches Warlock cannot be diagnosed by server logs; refresh connector tools and use the advertised schema.

Validation covers empty imports, ignored/conflicting/failed configurations, asynchronous file processing, partial-success retries, six-size back-and-sleeve MCP requests, and invalid-field feedback. These fixtures do not substitute for live supplier readback and visual approval.
