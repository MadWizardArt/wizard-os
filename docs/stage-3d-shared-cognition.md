# Stage III-D — Shared Council Cognition

## Objective
Let the Muses benefit from one another's verified experience without restoring token-heavy AI-to-AI chatter.

## Rules
- Shared cognition is derived from existing Muse memory; memories are not copied.
- Only `outcome` and `lesson` memories cross Muse boundaries.
- Routing is category- and portfolio-specific.
- Provenance remains attached to the source Muse.
- Shared evidence may inform proposal rationale but does not alter another Muse's confidence score.
- Council-level patterns require at least 3 verified outcomes across at least 2 different Muses.
- Patterns are labeled as convergence, caution, or mixed evidence. They are not commands.
- Brandon retains commit authority.

## Token behavior
The routing, pattern detection, API, and UI are deterministic application logic. No AI gateway request is needed.

## Surfaces
- `/api/museum/cognition?muse=<museId>` — selective shared cognition API
- `/museum/cognition` — inspect routed evidence and cross-Muse patterns

## Proposal behavior
When a new Muse proposal is created, a qualifying Council-level pattern in the same category may be appended to its rationale as contextual evidence. The Muse's own confidence calibration remains based only on her own verified outcome history.
