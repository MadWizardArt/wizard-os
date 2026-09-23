# Warlock 2.0 — Spellmark product pipeline

The Warlock workspace at `/etsy` now contains Products, Production and Listings. The standalone `/printful` URL remains an alias for the same read-only Production desk so old bookmarks still work.

## Product authority and fulfillment boundaries

- `SpellmarkProduct` owns artwork identity, collection, creative notes, and a manually maintained workflow stage. It does not assume that concept art is a printable master.
- `SpellmarkVariant` stores each edition. `DIGITAL` never has a Printful mapping; `PHYSICAL` may link the exact **Printful Product ID and Variant ID**. The variant ID is the actual purchasable blank, not the parent product ID.
- Etsy listing IDs are reserved for a subsequent integration step. Existing Etsy digital draft/image/file routes remain unchanged, and the current legacy Etsy draft creator is **digital only**.
- Product/variant storage is separate from `Transaction`, `ArtworkSale` and Museum intelligence data. No product seed/demo records are introduced, and no sales are recorded until an actual transaction occurs.

## Artist workflow

1. Unlock the Museum Artist Gate, then open Warlock → Products. Create the actual collection/artwork master and add digital format(s) if appropriate.
2. Open Warlock → Production. Use the server-side Printful token to select a blank catalog product and exact variant. Attach a physical edition to the master artwork.
3. Check a destination-specific shipping estimate and model retail margin. The cost desk **does not persist live rates or represent them as guaranteed invoice costs**.
4. Use Warlock → Listings for existing Etsy digital drafts. The future physical listing and Printful sync/order handoff must be implemented and tested separately. Publication and orders remain an artist-approved action.

## Security and setup

`PRINTFUL_PRIVATE_TOKEN` remains Vercel-only and is not exposed by any product API. All internal product reads and writes require the existing Artist Gate, and writes check same-origin requests. Existing Etsy OAuth/Warlock credentials and Etsy routes are untouched.

This phase is **product identity + Printful catalog mapping + a single Warlock interface**, not automatic physical listing synchronization, production file upload, order creation, or Printful account verification through ChatGPT.

The next phase should add explicit physical Etsy draft creation, an Etsy-to-Spellmark listing link, store shipping profile and returns policy validation, printable file/placement requirements, readiness gates, and a deliberate artist approval step. Keep public listings and order submission disabled until verified.
