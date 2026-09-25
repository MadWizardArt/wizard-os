# Warlock Commerce MCP v1

Warlock Commerce MCP is the private control surface that will eventually let ChatGPT Business operate the existing Spellmark commerce infrastructure without replacing WizardOS, Etsy, or Printful.

## v1 safety boundary

This first version is intentionally **read-only**.

It can:
- read the canonical `SpellmarkProduct` record and its assets/variants,
- validate whether the package is ready for production,
- summarize current Printful/Etsy mappings already stored in WizardOS,
- generate a dry-run production plan.

It cannot:
- create or edit Printful products,
- create or edit Etsy listings,
- upload files or images,
- publish a listing,
- place an order or incur a charge.

The remote endpoint is `/api/warlock/mcp` and remains unavailable unless `WARLOCK_MCP_ENABLED=true`.

Authentication currently reuses the private `WARLOCK_API_KEY`. The endpoint accepts either:
- `x-warlock-api-key: <key>`, or
- `Authorization: Bearer <key>`.

Before a ChatGPT Business workspace is connected, replace this staging authentication with the final workspace-compatible authentication flow if required.

## v1 tools

### get_product
Returns one canonical product by `productId` or exact `title`.

### validate_product_package
Checks master artwork, Etsy imagery, customer files, Printful mappings, variants, and retail pricing.

### dry_run_product
Produces the planned Warlock → Printful → Etsy execution sequence without performing any external writes.

### get_production_status
Returns product readiness plus stored Printful and Etsy mapping status.

## Canonical data rule

WizardOS remains the system of record.

The MCP does not create a second product database. It reads the existing:
- `SpellmarkProduct`
- `SpellmarkAsset`
- `SpellmarkVariant`

records.

## Next phase

After v1 is stable, add separately gated write services behind the same Warlock layer:

1. Printful file/product/mockup adapter.
2. Etsy physical draft adapter.
3. Etsy digital draft/file adapter.
4. Idempotency keys and operation log.
5. A confirmation-required `prepare_for_publish` / execute boundary.

Do not expose low-level vendor APIs directly as dozens of MCP tools. Keep the MCP contract small and let Warlock orchestrate vendor-specific calls internally.
