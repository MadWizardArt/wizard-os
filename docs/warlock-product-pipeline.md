# Warlock 2.0 — Spellmark product pipeline

The Warlock workspace at `/etsy` now contains Products, Production and Listings. The standalone `/printful` URL remains an alias for the same read-only Production desk so old bookmarks still work.

## Product authority and fulfillment boundaries

- `SpellmarkProduct` owns artwork identity, collection, creative notes, and a manually maintained workflow stage. It does not assume that concept art is a printable master.
- `SpellmarkVariant` stores each edition. `DIGITAL` never has a Printful mapping; `PHYSICAL` may link an explicit **Printful Store ID, Product ID and Variant ID**. The variant ID is the actual purchasable blank, not the parent product ID.
- Etsy listing IDs are reserved for a subsequent integration step. Existing Etsy digital draft/image/file routes remain unchanged, and the current legacy Etsy draft creator is **digital only**.
- Product/variant storage is separate from `Transaction`, `ArtworkSale` and Museum intelligence data. No product seed/demo records are introduced, and no sales are recorded until an actual transaction occurs.

## Artist workflow

1. Unlock the Museum Artist Gate, then open Warlock → Products. Create the actual collection/artwork master and add digital format(s) if appropriate.
2. Open Warlock → Production. Select the **Spellmark (Etsy)** store from the live accessible Printful stores, not Mad Wizard Art (Big Cartel). The store selection is explicit because an account-level token can access several stores. Then choose the blank catalog product and exact variant; attach a physical edition to the master artwork.
3. Check a destination-specific shipping estimate (scoped to the selected store) and model retail margin. The cost desk **does not persist live rates or represent them as guaranteed invoice costs**.
4. Use Warlock → Listings for existing Etsy digital drafts. The future physical listing and Printful sync/order handoff must be implemented and tested separately. Publication and orders remain an artist-approved action.

## Security and setup

`PRINTFUL_PRIVATE_TOKEN` remains Vercel-only and is not exposed by any product API. All internal product reads and writes require the existing Artist Gate, and writes check same-origin requests. Existing Etsy OAuth/Warlock credentials and Etsy routes are untouched.

This phase is **product identity + Printful catalog mapping + a single Warlock interface**, not automatic physical listing synchronization, production file upload, order creation, or Printful account verification through ChatGPT.

The next phase should add explicit physical Etsy draft creation, an Etsy-to-Spellmark listing link, store shipping profile and returns policy validation, printable file/placement requirements, readiness gates, and a deliberate artist approval step. Keep public listings and order submission disabled until verified.
\n## Shipping quote diagnostic (2026-09-23)\n\nA live catalog/variant lookup succeeded while an account-level token shipping quote returned a generic HTTP 502. Printful requires the `X-PF-Store-Id` header for account-level token shipping requests. Warlock now requests explicit store selection, verifies the selected store is in `/stores`, supplies this header for `/shipping/rates`, preserves the store on a physical variant, and displays distinct safe errors for rejection/unavailable variants. Catalog prices and live shipping still must be verified from an authenticated Artist session; this fix does not claim a successful quote until it is observed.\n
## Canonical create-or-complete intake

`intake_product` and authenticated `POST /api/warlock/intake` use the same service.
Supply `confirmIntake: true`, the approved `product`, and `productId` when resuming
an existing shell such as Luna. Without an ID, intake requires an unambiguous exact
title. Concurrent title-based requests are serialized in Postgres. Retries match
variants by owned `variantId` or fulfillment + exact label and preserve canonical
IDs. Omitted product fields, variant mappings, and prices survive partial retries.

Use `listing` for a single fulfillment or `listings` (one explicit fulfillment per
entry) for separate physical and digital listings. Set `retailPriceCents` for each
edition; a dollar `price`/`launchPrice` can supply a single variant's price. USD only.
Physical margin evaluation also needs actual `productionBaseCents` and ISO
`productionQuotedAt`; do not fabricate supplier quotes. Intake applies the Etsy
AI disclosure once and saves canonical listing records, not handoff notes.

Each asset must have its role and exactly one source: an owned canonical `assetId`,
a downloadable approved HTTPS `url`, or small `base64` bytes plus `name`.
URLs must be reachable by the server; ChatGPT attachment IDs, sandbox paths,
page links and inaccessible private downloads are not URLs for this operation.
Default HTTPS sources are OpenAI download hosts. Additional trusted exact hostnames
can be configured with `WARLOCK_INTAKE_ASSET_HOSTS`. Redirects obey the same allowlist.
No arbitrary URL is treated as a canonical private Blob asset. Intake verifies file
signatures, imports bytes to private storage and uses content-addressed paths for
retries. Maximum file size is 20 MB; submit packages above 80 MB in asset batches.
Base64 strings are limited to 4 MB each and must also fit the hosting request limit;
prefer downloadable URLs for full production files.

Hero/mockup assets are linked to the selected fulfillment (`fulfillment` omitted
means both listings). Hero is processed first. Customer files link only to digital.
Master and other assets remain product assets. Optional `position` controls rank;
conflicting ranks fail instead of silently replacing an approved asset. Existing
links and uploaded IDs are preserved on retry. Intake is additive; replacing or
reordering an asset requires a separate explicit review. Products already carrying
Etsy/Printful execution IDs are locked against intake changes.

Resume sequence: intake existing product → retrieve and validate → inspect Etsy
configuration → configure each fulfillment with verified live IDs → evaluate gates
→ supplier preflight (physical) → execution plan → confirmed draft execution → status.
Listings remain CONFIG until live configuration verification. Source filenames,
Etsy download limits, private storage, supplier quotes and all existing commerce
gates remain enforced. Execution checks private asset availability before its first
Etsy write. Intake never publishes, places orders, or executes Etsy drafts itself.
After deploying this schema change, manually refresh Warlock's tool list in Business.

### Native ChatGPT attachments

Intake advertises `_meta["openai/fileParams"] = ["files"]`. ChatGPT passes a
`files` array with `download_url` and `file_id` required and `mime_type` / `file_name`
optional. All four properties are declared in the descriptor, as required by
OpenAI's Scan Tools contract. For each file, supply a corresponding `assets` entry
with `fileId` matching that `file_id`, an explicit `role`, and optional `name`,
`fulfillment`, and `position`. The server downloads the authorized URL and imports
its real bytes through the same private-storage pipeline. Default attachment names
are converted to ASCII-safe filenames; supply `name` for a specific customer name.
A bare ChatGPT `file_id` is not a Warlock `assetId` and cannot retrieve bytes alone.
When a temporary URL expires, pass a fresh native file object and retry; canonical
assets and listing links remain deduplicated by product, role and content hash.

Refresh the Business app's tool list after deployment so it can negotiate the new
native file parameter. The tool count is now fifteen. On hosts that do not provide
file params, use an authorized downloadable URL or owned canonical Warlock asset.

Draft execution also requires production `WARLOCK_COMMERCE_WRITE_MODE=draft`.
Enable that setting after package validation, then redeploy; existing per-product
package, configuration, margin, supplier and private-storage gates still run before
any external draft write. Never interpret a missing setting as implicit permission
or bypass it by changing the guard's default.


### Preferred ChatGPT attachment handoff

Create or complete product metadata with `intake_product`, then call
`attach_product_file` once per attachment using the existing `productId`, required
native `file` input, explicit `role`, and `confirmAttachment: true`. Choose the
ChatGPT attachment ID through the host file input; the host resolves it to the
server-side object with `download_url` and `file_id`. Do not manually construct
file objects in the model-facing wrapper or put a ChatGPT ID in `assetId`.
The tool's top-level required single-file field avoids coupling attachment
resolution to the optional batch files field and separate asset ID references.
The batch intake path remains supported for clients that resolve file arrays.

The native attachment must reach Warlock as an object. Model-facing file IDs are
normal only when ChatGPT resolves them before sending the MCP request. If a bare
string reaches the server, stop and report a host file-resolution failure; never
invent a URL, substitute metadata for bytes, or bypass package validation.
Rescan the Business app after deployment and start a new conversation so the new
required file descriptor is loaded. Verify one master attachment first and confirm
that `get_product` returns a persisted asset with a positive byte size, then attach
listing images and digital customer files. Validate the completed package and
create Etsy drafts through `execute_draft_product`. Brandon reviews and publishes
in Etsy. Attachment retries preserve listings, configuration, prices and variants.

### Live Printful catalog and dated quotes

The catalog lives in Printful. Wizard OS provides the shared server service and
MCP exposes it to Aurelia; no separate catalog database, proxy service or browser
scraper is needed. The MCP now has **17 tools**:

1. `search_printful_catalog(query)` without a store ID lists accessible stores.
   Select Spellmark's Etsy store explicitly. Repeat with `storeId` to search by
   product title, brand, model and type; use returned `nextOffset` for more matches.
   Discovery is cached for up to five minutes per token/store and returns no prices.
2. `resolve_printful_catalog(storeId, productId, colors?, sizes?)` returns exact
   size/color variant IDs and product technique, file and option definitions.
   Filters are exact case-insensitive matches; an empty result is not a substitute.
3. Create canonical physical editions using `intake_product`, then call
   `configure_printful_variant` with canonical `productId`/`variantId`, supplier
   `catalogProductId`/`catalogVariantId`/`storeId`, and `confirmConfiguration: true`.
   The server verifies catalog identity and store access, fetches USD pricing and
   stock for North America, and saves the mapping and dated supplier quote.
   It preserves the approved retail price. Repeat per edition.

`productionQuoteJson` records supplier IDs, store, default technique and print
placement, region, currency, verification time, cost and exclusions. This snapshot
is a record of an API result, never a permanent price schedule. No catalog prices
are embedded in code or migrations. The existing cents and quote timestamp fields
remain compatible with margin reports and intake. API costs/stock never use the
five-minute discovery cache.

Before draft execution, live supplier preflight fetches pricing and availability
again and evaluates margins with those fresh costs. A stale saved cost cannot
approve a draft or prevent a live refresh. A price increase that breaks the margin
floor, unknown stock, changed print setup, inaccessible store, malformed response,
API outage or throttling blocks writes. Current quotes are included in the execution
report; approved retail prices are never automatically adjusted. API redirects
are rejected and upstream error bodies/credentials are not forwarded.

New imports support the executor's **default single print file**, default
non-embroidery technique, one unit, USD and North America. Existing configured
standard DTG front/back/sleeve stacks now support live pricing and preservation
(see below). New multi-placement file setup, embroidery and paid customization
options require separate explicit design/file/fee configuration.
A default placement carrying an additional surcharge or extra paid file layer is
rejected rather than underquoted. Quotes exclude shipping, taxes and order-specific
fees; margin reports retain those exclusions. Supplier preflight is bounded to
30 physical editions per product, with four concurrent workers and request-local
store-check deduplication. Quotes older than two minutes cannot reach draft writes.

Refresh the Business tool list after deployment. No publishing automation or order
creation is introduced; Brandon reviews and publishes Etsy drafts.

### Etsy draft import diagnostics

`check_printful_import` is a live read-only MCP tool. It queries
`/sync/products/@<canonical Etsy listing ID>` in the selected store without
rewriting the draft, saving IDs, or triggering a store refresh. Results include
`checkedAt`, store/listing IDs, exact variant matches, and recovery instructions.

- `AWAITING_PRINTFUL_IMPORT`: product lookup returned 404. Verify **Import not
  synced products** is enabled if the store displays that toggle, then use
  **Refresh data** once and check later. Printful documents daily Etsy draft
  import and a limit of 1,000 draft/inactive/expired listings.
- `IMPORTED`: exact external IDs/SKUs uniquely match all editions; confirmed
  execution can configure them. This does not mean already configured.
- `VARIANT_MAPPING_FAILED`: product exists but some editions are missing,
  ambiguous, or conflict with saved identity. No configuration writes occur.
- `PRINTFUL_API_ERROR`: authorization, rate limiting, timeout, invalid response,
  or identity verification failed. Sanitized codes distinguish these from 404.

The public API does not expose the import toggle or a documented force-refresh
operation. Its verification is reported as `MANUAL_CHECK_REQUIRED`; a missing
product does not prove the setting is disabled. If the toggle is absent, Printful
says existing products import automatically. Do not invent settings diagnostics
or publish Etsy drafts to bypass the delay.

Confirmed draft execution saves discovered product and matched variant IDs
before supplier configuration, returns mapping/API errors with the Etsy draft
IDs intact, and reaches human review only after configuration succeeds. Retry
confirmed execution after import or recovery; use the read-only tool while
waiting. No background polling or automatic retry is introduced.

References: https://developers.printful.com/docs/ ;
https://help.printful.com/hc/en-us/articles/50263352901905-How-do-I-manually-sync-products-to-my-store ;
https://help.printful.com/hc/en-us/articles/50262491807889-Why-don-t-all-of-my-Etsy-products-show-up-on-Printful

### Active Etsy listing recovery

`execute_draft_product` remains draft-only. If the owner published the physical
listing before Printful finished mapping, use `reconcile_printful_product` with
canonical `productId` or title and `confirmReconciliation: true`. The existing
`WARLOCK_COMMERCE_WRITE_MODE=draft` switch also gates these supplier-only writes;
no new environment variable or publishing write mode is required.

Reconciliation reads the selected listing and inventory through GET-only Etsy
requests. It requires the owned shop, active state, disclosure, the complete exact
physical variant set with matching IDs/SKUs, and live USD prices equal to approved
canonical prices. It ignores the separate digital listing. Differences return
blockers rather than rewriting the active product. Live supplier prices, stock,
margin/compliance gates, and verified private master remain mandatory. Listing
state, identity, inventory and prices are checked again before supplier writes.

The existing sync service persists discovered Printful IDs before configuration.
Reconciliation omits retail_price and sku from supplier PUT bodies so it does not
attempt to change store inventory. It never calls the Etsy draft executor, changes
Etsy state, uploads listing assets, creates duplicate listings, or handles orders.
Results are `RECONCILED`, `AWAITING_PRINTFUL_IMPORT`, or `BLOCKED` with detailed
Printful mapping/API progress. Repeated confirmed reconciliation can resume partial
configuration; success means supplier configuration completed, not publishing.

### Sync ID storage and failure diagnostics

Printful sync product/variant IDs are stored as opaque decimal text so IDs above
2,147,483,647 cannot overflow signed PostgreSQL INTEGER columns. The migration
casts existing values without deleting records or indexes. Catalog/store IDs
are unaffected. The MCP repository preserves its numeric contract only for
positive JavaScript-safe integers; unsafe values are rejected rather than rounded.

The shared draft/reconciliation sync service returns `diagnostic.stage`, canonical
`variantId` where relevant, and a sanitized `causeCode` for product-ID persistence,
variant-ID persistence, master signing, live quote checks, supplier configuration,
and final completion persistence. Database errors expose only Prisma codes, never
connection strings or raw exception bodies. Printful rejection messages are
returned with credentials and signed URLs redacted. Partial configured variant
IDs and imported identity are retained in the report so retries are reviewable.


### Preserve configured Printful placements during supplier refresh

Once an imported sync variant ID is saved, `configure_printful_variant` and execution
preflight read that variant's actual Printful print files. Standard DTG front, back,
left-sleeve and right-sleeve stacks are priced from live variant and placement prices,
with one included placement credited using the catalog placement order. Store discounts
come from the API; no garment prices are embedded in code. Existing default single-file
products retain their supported base quote, including non-DTG products.

The dated snapshot records the sync variant ID, selected placements, fee breakdown and
a configuration fingerprint, without file URLs. A default snapshot can upgrade to the
verified configured stack. A previously configured stack that changes or disappears
blocks execution until `configure_printful_variant` explicitly refreshes it. Unsupported
options, special placements, incomplete files or ambiguous pricing block refresh and
leave the prior saved cost intact. Approved retail prices are never changed.

Sync retries re-read the imported configuration and preserve an already configured
variant when its fingerprint matches the fresh quote. They do not sign or upload a
replacement default file, change supplier prices/SKUs, or replace back/sleeve placements.
Only unconfigured imports receive the existing default-file setup. Etsy remains read-only
for active-listing reconciliation; publication and orders remain manual.

For the already synced Night Herbarium sweatshirt, refresh each existing edition using
`configure_printful_variant` with its unchanged catalog/store selection, then evaluate
margins. This saves current configured costs; do not restore screenshot prices as constants.
Live configured charges still exclude shipping, taxes and order-specific fees.


### Confirmed retail edits after draft execution

Warlock MCP v0.6.0 advertises 18 tools, including `update_product_prices`. Product
intake remains locked after external execution; it must not be used to re-create or
amend an executed product just to change retail prices.

1. Call `get_product` and select the canonical product and exact variant IDs.
2. Call `update_product_prices` with `productId`, `confirmPrices: true`, and a `prices`
   array. Each entry requires `variantId`, `expectedRetailPriceCents` (the current
   saved cents, or null when unset), and the approved positive `retailPriceCents`.
3. All selected prices are saved together in a serializable transaction. Stale
   prices, foreign variants or unsupported currency block the entire batch. Exact
   retries are no-ops. Only retail-price fields change; supplier quotes, files,
   sync IDs, listings and listing status are preserved.
4. Re-evaluate margins using the configured live supplier costs. The result reports
   `CANONICAL_PRICES_SAVED`, `etsyMutated: false` and `printfulMutated: false`.
   Existing Etsy/Printful retail prices are unchanged. Verify/edit the Etsy prices
   separately; an active listing must not go through draft execution to change prices.
   Reconciliation continues to require canonical and live Etsy prices to agree.

For Night Herbarium, the approved 2XL and 3XL retail target of $57.44 is submitted as
5744 cents for each corresponding variant. This example is user-approved retail,
not a hardwired supplier price or a claim that production records have been updated.
No new environment variable is needed. Refresh the connector's tool list if the
Business session still advertises 17 tools; the new count is 18.


### Confirmed live Etsy variation pricing and Printful retail mirroring

Warlock MCP v0.7.0 advertises 20 tools. `inspect_etsy_variant_prices` reads the owned,
already-active physical Etsy listing's exact product IDs/SKUs, current USD prices,
complete inventory fingerprint and mapped Printful retail prices. It requires the
saved Etsy and Printful sync identities. No import refresh or write occurs.

After saving approved canonical targets through `update_product_prices`, call
`update_etsy_variant_prices` with `productId`, the inspector's
`expectedInventoryFingerprint`, `confirmLivePriceWrite: true`, and up to six
selected price entries. Each entry supplies `variantId`, `expectedEtsyPriceCents`,
`expectedPrintfulRetailPriceCents` (including null/zero when returned by Printful),
and `retailPriceCents`, which must match the canonical target. Live physical
products are limited to 30 editions per listing; digital/draft price edits are
outside this tool's current scope.

The tool checks owned active listing identity, exact variant IDs/SKUs, currency,
expected prices, fresh supplier costs/stock, configured file fingerprints and
selected-edition margins. It re-reads inventory and canonical state after the slow
checks. Etsy's inventory API requires the complete current inventory body, so it
preserves current quantities, enabled flags, SKUs, property values, price/quantity
property grouping and processing profiles; only selected prices are replaced.
Unsupported or ambiguous inventory blocks before writing. API product/offering
IDs and response-only fields are omitted as required by Etsy, then existing product
IDs and the complete desired inventory are checked through a fresh GET.

After Etsy prices verify, Printful receives only `retail_price` for each selected
sync variant. Supplier files, options, mappings and configuration fingerprints are
verified before and after each mirror. Etsy is the storefront price source;
Printful's retail values are explicitly mirrored, never assumed to auto-sync.
No metadata, assets, listing-state, publication, re-draft or order calls occur.

The existing `WARLOCK_COMMERCE_WRITE_MODE=draft` flag enables this separately
confirmed price-only exception; draft execution still rejects active listings and
publishing stays unavailable. No new variable or schema migration is required.
The app serializes canonical and live retail operations using the same product
advisory lock. The pre-write GET and inventory PUT are not atomic: simultaneous manual
inventory edits or sales between the final GET and PUT remain a race. Avoid manual
inventory edits during an update; post-write verification detects discrepancies
but cannot guarantee prevention of that external race.

Success is `LIVE_PRICES_VERIFIED` only after Etsy, canonical targets and all selected
Printful retail mirrors agree. `VERIFY_OR_RETRY_REQUIRED` explicitly reports stages,
Etsy write attempts/verification and verified Printful progress. Provider operations
are not an atomic transaction. Network timeouts, provider rejection or interrupted
operator locks may leave partial changes; inspect current values before retrying the
same targets. No automatic rollback or re-drafting is attempted. Exact retries do
not re-write completed prices. Actual production price verification happens in the
authenticated Business commerce session after deployment.

API references:
- https://developers.etsy.com/documentation/tutorials/listings/#updating-inventory
- https://developers.printful.com/docs/#tag/Ecommerce-Platform-Sync-API
