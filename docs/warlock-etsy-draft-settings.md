# Etsy draft default configuration

Warlock remains canonical. This extends `intake_product`, `get_product`,
`inspect_etsy_configuration`, `configure_etsy_listing`, gates/execution plans,
`execute_etsy_draft_only`, and `execute_draft_product`. There is no new integration,
browser bridge, automatic publication, or order placement.

## API capability check (2026-10-07 UTC)

Checked Etsy's current [OpenAPI schema](https://www.etsy.com/openapi/generated/oas/3.0.0.json)
and [reference](https://developers.etsy.com/documentation/reference/).

| Setting | Draft write | Listing readback | Handling |
| --- | --- | --- | --- |
| Category | `taxonomy_id` | `taxonomy_id` | Keep existing product-specific configuration |
| Shop section | `shop_section_id` | `shop_section_id` | Require explicit product-specific section; validate against this shop before execution |
| Production partner | `production_partner_ids` | Not present in `ShopListing` | Apply canonical Printful ID on physical writes; keep assignment verification manual |
| Digital creation control | No field or documented enumeration | Not exposed | Save internal intent; return `MANUAL_DIGITAL_CONTENT_CREATION_ACTION_REQUIRED` |
| Etsy Ads | No endpoint/field for enrollment or current setting | Not exposed | Save intent; return `MANUAL_ETSY_ADS_ACTION_REQUIRED` for on/off verification |

Discovery uses `getShopSections` and `getShopProductionPartners`; partner discovery
requires `shops_r`. A missing grant or failed live check blocks configuration; no
IDs are sourced from chat memory. Draft writes retain the existing `listings_w`
scope and write guard. If Etsy adds capabilities later, update the capability
declaration and verified transport rather than guessing a field name.

## Canonical fields and defaults

Each `SpellmarkListing` owns `shopSectionId`, `productionPartnerId`,
`digitalContentCreationType`, and `etsyAdsEnabled`. Ads defaults to `true`, and an
explicit `false` override survives partial intake/configuration retries. Neither
value proves that Ads is activated remotely.

Digital listings default to internal intent `AI_ASSISTED_DIGITAL_DESIGN`, with no
production partner. This string is **not an Etsy API enum** and is never sent as
one. Physical listings must have canonical Printful mappings for every variant
and an explicitly selected live shop partner named Printful. Other fulfillment
suppliers fail closed. Physical listings cannot have digital-creation intent.

Shop sections have no universal default. Inspect live sections, choose the section
appropriate to the product/collection/listing type, and configure its exact ID.
Ambiguous or unresolved selection remains a configuration requirement. Existing
listings are not backfilled with guessed section or partner IDs.

Every description retains exactly this required sentence:

> Created using a combination of original art direction, digital design, and AI-assisted image-making.

## Normal MCP sequence

1. Intake product copy, assets, variants and intended settings. Intake remains
   CONFIG until live configuration verification.
2. Inspect configuration. The result includes live shop sections/partners,
   per-listing canonical settings, remote metadata, capability limits, and manual
   requirements for both physical and digital listings.
3. Call `configure_etsy_listing` with product selector, fulfillment, taxonomy ID,
   **shopSectionId**, `confirmConfiguration:true`, and physical profiles plus
   **productionPartnerId** when physical. Omitted digital intent defaults to the
   Spellmark AI-assisted workflow. Digital partner must be absent/null.
4. Validate/prepare the existing execution plan. Missing section/partner/creation
   intent blocks draft execution. Unsupported controls are explicit warnings and
   review tasks rather than invented remote writes or a claim of completeness.
5. Execute the established draft operation. All applicable listings' section and
   partner IDs are revalidated before the first Etsy write. The existing Etsy-first
   supplier workflow, draft-only guard and approval requirements are unchanged.
6. Read back category, section, ownership, draft state and exact disclosure.
   Save `etsyDraftSettingsVerificationJson` plus a journal record. An ignored
   setting or unreadable response produces durable discrepancy evidence and fails
   execution. A new attempt clears stale settings evidence before writing.
7. Complete manual digital-creation/Ads selections and production-partner review
   in Etsy. `fullyConfigured` remains false while these controls cannot be verified
   through the API. Owner final review and publication remain manual.

Physical forms send the one selected partner ID. Digital forms send an empty
`production_partner_ids` array representation to avoid retaining a physical
partner on a reused draft. An Etsy rejection is a write failure, not evidence of
successful clearing. As assignment readback is unavailable, always verify **no
partner** for digital drafts and **Printful** for physical drafts in the editor.

Configuration evidence is stored separately from existing bookkeeping observations
and timestamps. The active-listing supplier reconciliation operation preserves its
existing gates and does not acquire new-draft configuration prerequisites.

## Validation limits

Tests use mocked Etsy responses and isolated database/auth modules, including
pre-write all-listing checks, unchanged disclosure, manual capability reporting,
and persisted discrepancies. No live draft, Ads enrollment, partner assignment,
publication, or order was performed to validate this patch. Verify the first real
draft's editor controls during the normal owner review.
