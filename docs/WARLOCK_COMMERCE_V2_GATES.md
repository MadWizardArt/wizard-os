# Warlock Commerce v2 — Safety Gates

Warlock v2 adds pre-execution business safeguards before any future Etsy or Printful write automation is enabled.

## Canonical Etsy AI disclosure

Every Etsy description created or edited through current Warlock routes is normalized through one required disclosure:

> Created using a combination of original art direction, digital design, and AI-assisted image-making.

The helper is idempotent: if the disclosure already exists, it is not duplicated.

Covered paths:
- generic Etsy draft creation,
- Etsy listing description edits,
- the Volans physical-release route,
- Warlock product intake metadata.

## Compliance gate

The compliance gate verifies that a canonical product has usable listing identity/copy and produces the exact outbound Etsy description after required disclosure injection.

Missing disclosure is not allowed to reach Etsy silently; Warlock appends it and reports that it was injected.

## Margin gate

The default U.S. base fee estimate currently includes:
- $0.20 Etsy listing/renewal allowance,
- 6.5% Etsy transaction fee,
- 3% + $0.25 U.S. Etsy Payments processing fee.

The estimate intentionally excludes shipping, sales tax, Etsy Ads, Offsite Ads, currency conversion, refunds, and other order-specific charges.

Configuration:
- `WARLOCK_MIN_CONTRIBUTION_MARGIN_PCT=20`
- `WARLOCK_MAX_PRODUCTION_QUOTE_AGE_DAYS=7`

Physical variants are blocked when:
- retail price is missing,
- Printful production cost is missing,
- the production quote has no timestamp,
- the production quote is older than the configured age,
- estimated contribution margin falls below the configured floor.

Digital variants use a zero production-base cost unless a future digital-cost model is added.

## Supplier gate

Every physical variant must have:
- Printful catalog product ID,
- Printful catalog variant ID,
- Printful store ID.

The live `preflight_supplier` MCP tool performs authenticated **GET-only** checks against Printful immediately before any future external write. It verifies:
- the selected store is accessible,
- the catalog variant still exists,
- the variant still belongs to the expected catalog product,
- North America availability reports in stock.

Unknown or unavailable stock fails the preflight conservatively.

## MCP additions

Two read-only tools are added:
- `evaluate_commerce_gates`
- `preflight_supplier`

No Etsy or Printful mutation tools are introduced in this phase.

## Write-phase rule

Future commerce writes may only run after:
1. canonical package validation passes,
2. compliance gate passes,
3. margin gate passes,
4. live supplier preflight passes for physical products,
5. idempotency check confirms the operation will update rather than duplicate where applicable.

Publishing remains a separate explicit approval boundary.
