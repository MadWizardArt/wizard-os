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