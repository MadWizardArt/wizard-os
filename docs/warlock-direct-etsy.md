# Warlock — direct Etsy API bridge

Warlock is a **thin API bridge** between a single-owner ChatGPT connector and Etsy. It is not a Muse handoff queue. The artist reviews before publication; this bridge only creates and edits drafts and their assets.

## One-time setup

1. Deploy the Prisma migration for `EtsyConnection`.
2. Configure `WARLOCK_SHOP_ID` in Vercel with the numeric Etsy shop ID of the **owner’s shop**; without this setting, existing browser access still works, but no persistent grant is created for the direct API. A different OAuth account cannot replace the allowlisted shop. This prevents an unrelated OAuth login from replacing the shared grant. Generate a random secret of at least 32 characters and configure it as `WARLOCK_API_KEY` in Vercel. Never commit it, paste it into a conversation, or expose it to the browser.
3. Visit `/api/etsy/connect` in your **own** browser and authorize the Etsy shop once. The OAuth callback encrypts and saves the grant to PostgreSQL. An existing valid browser cookie also migrates on the next Warlock request.
4. Install/configure an actual ChatGPT-compatible connector exposing the Warlock operations below and storing the API key as an integration secret. A website endpoint alone does not grant ChatGPT a new callable tool. No browser automation is needed for subsequent API operations once the connector is connected.

## Authentication

Browser requests continue to use the existing `etsy_session` HttpOnly cookie. Connector requests send `x-warlock-api-key: <integration secret>` over HTTPS. An invalid supplied header is never treated as a browser session; a correct API key without an existing OAuth grant does not authorize access. Rotate the key by replacing `WARLOCK_API_KEY` and reconnecting the integration.

## API operations (never auto-publish)

- `GET /api/etsy/shop`: verify owner/shop connection.
- `GET /api/etsy/listings?state=draft`: find existing drafts before creating a new listing.
- `POST /api/etsy/drafts`: create a draft (currently **digital only**; physical POD variants still need a dedicated implementation).
- `GET/PATCH /api/etsy/listings/:listingId`: inspect/change a draft.
- `POST /api/etsy/listings/:listingId/images`: upload listing image via multipart `image` field, optional `rank`.
- `POST /api/etsy/listings/:listingId/files`: upload a digital customer file via multipart `file` field.
- `GET /api/etsy/listings/:listingId/status`: verify image and digital-file counts. The digital-file criterion **does not apply to physical POD prints**.

## Boundaries

- Do **not** revive a Muse-to-Warlock project queue, `MUSE_HANDOFF_SECRET`, or the former `/api/etsy/aurelia-drafts` path.
- Do not create placeholder customer ZIPs or claim a physical Printful listing is ready when only image mockups exist.
- The service holds an Etsy grant encrypted with `ETSY_SESSION_SECRET`; rotate this encryption secret only with a reauthorization plan, or the saved token will become unreadable.
- Never publish a listing without the artist's explicit instruction. Verify listing ID, draft state, image rank/count, and available variant/product status before reporting success.
