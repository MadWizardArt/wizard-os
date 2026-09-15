# Verification plan

Before merging Stage III-E hardening:

1. Production-style build must pass type checking and static generation.
2. `/museum/intelligence` must render without exposing Vault data before authentication.
3. `/api/museum/artist-session` must report configured/authenticated state without exposing secrets.
4. `/api/museum/knowledge` and `/api/museum/intelligence` must return 401 without a valid Artist session after deployment.
5. If `MUSE_ARTIST_ACCESS_KEY` is absent, the chamber must render a setup-required state and model fuel must remain disabled.
6. No model call should be executed during verification.
7. Existing Stage III cognition/agency routes should remain build-valid.
