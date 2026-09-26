# Warlock Commerce v8 — ChatGPT OAuth Compatibility

## Purpose

Warlock Commerce remains a single-owner private MCP server, but ChatGPT Business custom MCP connections require standards-compatible OAuth rather than a customer-supplied static API key.

v8 adds a narrow OAuth 2.1 compatibility layer without changing the commerce execution architecture.

## Security boundary

- Existing `WARLOCK_API_KEY` remains the owner credential and trusted direct-client credential.
- The operator key is entered only on the WizardOS authorization page and is never returned to ChatGPT.
- The OAuth client is allowlisted to the stable ChatGPT Client ID Metadata Document:
  `https://chatgpt.com/oauth/client.json`.
- The only allowed redirect URI is:
  `https://chatgpt.com/connector_platform_oauth_redirect`.
- Authorization Code + PKCE S256 is required.
- OAuth access tokens are opaque, short-lived (1 hour), and stored only as SHA-256 hashes.
- Refresh tokens are opaque, rotate on use, expire after 30 days, and are stored only as SHA-256 hashes.
- Authorization codes are one-time and expire after 5 minutes.
- Every OAuth grant stores a fingerprint of the current `WARLOCK_API_KEY`; rotating that key invalidates existing grants.
- OAuth does not enable `WARLOCK_COMMERCE_WRITE_MODE`.
- No OAuth route can publish Etsy listings or place Printful orders.

## Endpoints

- Protected resource metadata:
  `/.well-known/oauth-protected-resource`
- Authorization server metadata:
  `/.well-known/oauth-authorization-server`
- Authorization:
  `/api/warlock/oauth/authorize`
- Token:
  `/api/warlock/oauth/token`
- MCP resource:
  `/api/warlock/mcp`

The MCP endpoint continues to support the existing trusted `x-warlock-api-key` / raw Bearer operator-key path as well as OAuth access tokens.

## OAuth scope

`warlock:operate`

`offline_access` may also be requested to support refresh-token continuity.

## ChatGPT Business handoff

Do not enable commerce draft writes merely to connect ChatGPT.

Recommended sequence:

1. Deploy v8 with `WARLOCK_MCP_ENABLED=true`.
2. Keep `WARLOCK_COMMERCE_WRITE_MODE=disabled`.
3. Verify discovery metadata and unauthenticated MCP challenge.
4. Add the custom MCP server in ChatGPT Business.
5. Complete OAuth through the WizardOS owner authorization page.
6. Verify read-only tools such as `get_product`, `validate_product_package`, `inspect_etsy_configuration`, and preflight tools.
7. Only after the connection is proven should draft execution be considered separately.

## Compatibility note

`@modelcontextprotocol/server` v2 preserves OpenAI extension metadata through each tool's `_meta`. v8 advertises the OAuth security scheme there while transport-level OAuth discovery and challenges remain authoritative. The Business connection test is the final compatibility check before enabling any write mode.
