# Stage III-E Hardening — Artist Fuel Gate

Selective Intelligence remains advisory and token-controlled.

## Security boundary

- `MUSE_ARTIST_ACCESS_KEY` must be set to a private value of at least 16 characters before the intelligence chamber can unlock.
- Successful Artist authentication creates a 12-hour `HttpOnly`, `Secure` (production), `SameSite=Strict` session cookie.
- Council Knowledge Vault reads/writes and Intelligence Quest reads/writes require a valid Artist session.
- Same-origin checks remain in place for mutating endpoints.
- `MUSE_INTELLIGENCE_ENABLED=true` is still required before any model call can run.

## Fuel controls

Defaults can be overridden by environment variables:

- `MUSE_INTELLIGENCE_MAX_RUNS_PER_DAY=4`
- `MUSE_INTELLIGENCE_DAILY_TOKEN_BUDGET=15000`
- `MUSE_INTELLIGENCE_MAX_OUTPUT_TOKENS=1000`
- `MUSE_INTELLIGENCE_MODEL=openai/gpt-5.6-sol`

The UI exposes daily usage and remaining allowance. Quest creation is token-free.

## Duplicate protection

Fueling a quest atomically claims its exact stored record by changing it from `candidate` to `running`. A second request cannot claim the same record and therefore cannot double-spend the same quest.

## Failure behavior

A failed model call is persisted as `failed` with a bounded error summary. Nothing is executed automatically, and the Artist Gate remains the commitment boundary.

## Knowledge boundary

The Council Knowledge Vault is retrieval memory for Wizard OS. It does not train or alter model weights. Curated knowledge capsules preserve provenance and should be preferred over dumping whole ChatGPT project conversations into prompts.
