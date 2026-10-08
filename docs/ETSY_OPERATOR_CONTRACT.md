# Etsy Operator Contract

## Purpose

This is the canonical operating contract for Etsy production in WizardOS / Warlock.

The goal is to keep Etsy publishing separate from software development.

## Canonical architecture

**Aurelia / ChatGPT → Warlock Etsy API → Etsy Drafts**

- **Aurelia / ChatGPT** prepares the product, listing copy, mockups, customer files, and approval package.
- **Warlock Etsy API** performs Etsy transactions only.
- **Etsy** remains the storefront and draft-review destination.
- **WizardOS** is the operator dashboard / system of record.
- **GitHub / Vercel** are maintenance and deployment infrastructure only. They are not part of a normal Etsy upload.

## Existing Etsy transaction routes

- `POST /api/etsy/drafts` — create an unpublished Etsy listing.
- `PATCH /api/etsy/listings/[listingId]` — update listing metadata.
- `POST /api/etsy/listings/[listingId]/images` — upload listing images/mockups.
- `POST /api/etsy/listings/[listingId]/files` — attach digital customer files.
- `GET /api/etsy/listings/[listingId]/status` — verify images/files and readiness for human review.
- `GET /api/etsy/shop` — verify the Etsy connection.

These routes accept the authenticated Warlock browser session or the separate `x-warlock-api-key` direct-connector credential.

## Hard routing rule

When the operator says any equivalent of:

- “send this to Etsy”
- “send this to Etsy drafts”
- “Aurelia, send this product”
- “route this to Etsy”
- “upload the mockups/files to Etsy”

the request is an **Etsy transaction**, not a software-development request.

### Never do this as a fallback

Do **not**:
- edit WizardOS code,
- create a GitHub branch,
- open a pull request,
- create a new API route,
- deploy Vercel,
- use browser automation,
- create an Aurelia handoff queue,
- invent a new bridge,
- or rewrite the Etsy integration

unless the operator explicitly asks for engineering work.

If no direct Warlock write tool is available in the current ChatGPT environment, stop the transaction path and report exactly:

> “Warlock’s Etsy API is ready, but this chat does not currently have the Warlock write connector bound. No code changes were made.”

Then preserve the finished product package for the next available execution surface.

## Publishing state

Normal automation stops at **Etsy draft / human review**.

Aurelia or Warlock must not publish a live listing unless Brandon explicitly asks to publish it.

## Product flow

1. Product/design complete.
2. Master files finalized.
3. Listing copy finalized.
4. Hero image and individual mockups prepared.
5. Customer download files packaged.
6. Create Etsy draft.
7. Upload every required mockup/listing image.
8. Upload every required digital file.
9. Query readiness/status.
10. Report Etsy listing ID and counts.
11. Brandon reviews and approves in Etsy.
12. Publish only on explicit instruction.

## Separation of concerns

### Production request
“Send this to Etsy drafts.”

Expected action:
Warlock API transaction only.

### Engineering request
“Fix the Etsy API,” “change WizardOS,” “add a route,” or “debug authentication.”

Expected action:
GitHub/Vercel/code work may be appropriate.

Do not infer an engineering request from a failed or unavailable transaction tool.

## Authentication

The persistent direct connector is intended to authenticate with `WARLOCK_API_KEY` using the `x-warlock-api-key` header. Etsy OAuth remains stored server-side by Warlock.

Secrets must never be committed to GitHub, included in product assets, or pasted into listing data.

## Retroactive intake of existing Etsy listings

Warlock supports both directions: canonical product → new Etsy draft, and an owned existing Etsy draft or active listing → canonical product. For manually created listings, use the existing `preview_etsy_draft_import` / `apply_etsy_draft_import` tools (names retained for compatibility). Pass `productId:null` and `expectedEtsyListingId:null` when creating a missing canonical record. Import reads copy, category, prices and the complete variant set; it does not require matching old SKUs. For an existing canonical product whose inventory already matches, `preview_etsy_listing_link` / `apply_etsy_listing_link` can instead adopt a draft or active listing.

Show the exact fresh preview for owner approval. Both paths verify shop ownership, recheck remote/canonical state under locks and reject duplicate linkage. They perform no Etsy/Printful writes, preserve the observed `draft` or `active` state, and never recreate, deactivate or publish the listing. State changes between preview and apply require a fresh preview. Inactive, expired and sold-out targets remain unsupported by these adoption tools.

After adoption, use the returned canonical product ID with `attach_product_file` for hero/mockup images, then `inspect_etsy_listing_images` and an owner-approved `update_etsy_listing_image`. Title edits use their existing preview/apply tools. Do not rerun draft creation to send mockups. Supplier mapping, quotes, AI disclosure and visual verification remain separate; importing a live listing is not proof of fulfillment readiness.

`DRAFT_CREATED` remains the existing internal linked workflow stage; it is not an assertion that Etsy is currently a draft. The observed remote state is recorded in the preview, result and durable evidence. No API credential, new integration, schema migration or browser upload is needed.
