# Warlock Commerce v3 — Fail-Closed Write Infrastructure

Warlock v3 prepares the execution layer while keeping all external commerce mutations disabled by default.

## Corrected physical workflow

For API-driven Etsy automation, Etsy owns the external-commerce listing.

The canonical physical sequence is:

1. Validate the canonical Spellmark package.
2. Evaluate compliance and contribution-margin gates.
3. Run live Printful supplier preflight.
4. Create or update the Etsy physical draft and its variant inventory.
5. Wait for the connected Etsy draft to appear in Printful's ecommerce-platform sync feed.
6. Map each imported Etsy variant to its approved Printful catalog variant and production file.
7. Generate Printful mockups.
8. Persist generated mockups in controlled storage.
9. Upload approved Spellmark hero images and mockups to the Etsy draft.
10. Stop for human review.

This also supports Etsy listings that combine variants from more than one Printful catalog product.

## Write mode

`WARLOCK_COMMERCE_WRITE_MODE` is fail-closed:

- `disabled` — default. No external mutation may execute.
- `draft` — future create/update draft operations may execute.

There is intentionally no `publish` mode.

Publishing remains a separate human approval action.

## Private production files

Spellmark masters remain private in Vercel Blob.

When Printful needs a production file, Warlock creates a short-lived private GET URL using Vercel Blob signed URLs. The default lifetime is 15 minutes and is capped at 1 hour.

This avoids making master artwork publicly accessible simply to satisfy Printful's file-fetch workflow.

## MCP

`prepare_execution_plan` is a read-only MCP tool. It shows:

- package validation,
- commerce-gate results,
- selected physical execution strategy,
- current write mode,
- each planned external mutation,
- whether those mutation steps are currently enabled.

The planner does not perform any Etsy or Printful write.

## Next implementation boundary

After this infrastructure is validated, the next layer should introduce canonical Etsy listing records for each Spellmark product:

- physical listing configuration,
- digital listing configuration,
- taxonomy,
- tags,
- shipping profile,
- readiness/processing profile,
- title and description overrides where necessary,
- external Etsy listing ID.

Only after listing configuration becomes first-class canonical data should the generic Etsy draft writer and Printful ecommerce-sync writer be enabled behind `WARLOCK_COMMERCE_WRITE_MODE=draft`.
