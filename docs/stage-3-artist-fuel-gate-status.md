# Stage III-E hardening status

Owner: Novy
Reviewer: Melina
Pull request: #42

Objective: secure selective Muse reasoning so only the Artist can access internal Council knowledge or spend model tokens.

Implemented on `stage-3-artist-fuel-gate`:

- Artist session gate
- protected Knowledge Vault and Intelligence Quest APIs
- daily run and token budgets
- per-quest output ceiling
- atomic single-fire quest claim
- failure persistence
- visible fuel usage in the intelligence chamber
- AI fuel still disabled until production access key and fuel flag are configured

Verification policy: the exact PR head must receive a clean preview build. An earlier green preview is not sufficient evidence after later security changes.

Completion condition: preview build passes, unauthenticated API checks return 401, production deploy succeeds after merge, and no model call occurs during verification.

## Activation update — 2026-09-15

The Artist reports that `MUSE_ARTIST_ACCESS_KEY` and `MUSE_KNOWLEDGE_INGEST_KEY` have been added to the Vercel Production environment. This documentation commit intentionally triggers a fresh production build from canonical `main` so the new environment values can be loaded by the deployment. `MUSE_INTELLIGENCE_ENABLED` remains outside the activation proof until the Artist Gate and Knowledge Intake configuration are verified live.
