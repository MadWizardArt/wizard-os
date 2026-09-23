# Spellmark / Printful Cost Desk

Printful cost research lives in Warlock → Production (`/etsy?tab=production`) in the canonical Wizard OS Vercel project `wizard-os-299p`. The old `/printful` URL remains available as a standalone view of the same tool. Warlock now houses Products, Production and Etsy Listings, with separate backend integrations. The Cost Desk does not create Etsy listings, Printful products, orders, or charges.

## One-time Printful setup

1. In the [Printful Developer Portal](https://developers.printful.com/), create a **private token**, scoped to the specific existing store where possible. Grant only the read privileges needed for store verification, catalog and shipping quotes; do not use broad order write scopes for this desk.
2. Add `PRINTFUL_PRIVATE_TOKEN` in **Vercel → wizard-os-299p → Settings → Environment Variables**. Add `PRINTFUL_STORE_ID` only when using an account-level token; omit it for a token already scoped to a single store.
3. Apply to Preview and Production as needed, redeploy, then unlock the existing Artist Gate in the Museum and visit Warlock → Production. Never paste the token into chat, commit it, or put it into a browser-local setting.
4. Verify that the status says connected and displays the expected store. Search `poster`, choose the exact unframed or framed product, and compare 8×10 and 11×14 variants where supported.
5. Enter the intended shipping destination, retrieve a fresh estimate, and enter the selling price, buyer-paid shipping, estimated Etsy fees, and any taxes or added Printful charges to estimate profit.

## Accuracy and safety boundaries

- Catalog prices are the base variant prices returned by Printful, **not** a guaranteed final production charge or an account-discount-confirmed invoice.
- Printful shipping quotes are dynamic and must be requested shortly before actual fulfillment. This UI never caches them.
- Optional print placements, packaging, discounts, tax, currency differences and live fulfillment charges can change the total. User-entered fee assumptions are not actual Etsy fee data.
- The server-side route is artist-session gated, is limited to fixed Printful API endpoints, forwards no arbitrary Printful error response, and does not return a credential to the browser.
- If status reports an invalid token/insufficient scopes, confirm token/store selection and relevant read permissions. Printful private tokens expire or can be revoked; rotate via Vercel.
- The desk deliberately performs **no order submission and no Etsy publishing**. The Artist approves retail pricing and Warlock handoff separately.

Printful reference: https://developers.printful.com/docs/

## Warlock 2.0 integration

Create the artwork once in Warlock → Products. In Production, choose the exact Printful catalog variant and attach it to that artwork. The saved link is a blank-product mapping; prices and shipping estimates remain provisional and must be refreshed. Existing Etsy digital draft tools stay in Warlock → Listings. See `docs/warlock-product-pipeline.md` for the physical Etsy draft work that remains.
