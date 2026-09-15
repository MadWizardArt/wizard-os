# Stage III-E — Selective Intelligence

Status: implemented behind a locked AI fuel gate.

## Purpose
Wizard OS should behave like a small domain intelligence system without recreating continuous AI-to-AI chatter. Deterministic observers, memory, shared cognition, and the Knowledge Vault gather context cheaply. Model reasoning is reserved for bounded Intelligence Quests that genuinely benefit from synthesis, strategy, research, or creative inference.

## Intelligence Quest flow
1. A bounded question is assigned to one accountable Muse and one category.
2. Creating the quest makes no model call.
3. Wizard OS assembles only relevant Council Knowledge, routed cross-Muse evidence, Council patterns, and that Muse's charter.
4. The Artist explicitly chooses **Fuel this quest** before a model request is allowed.
5. The model returns one advisory synthesis. It cannot publish, spend, delete, price, or otherwise commit an action.
6. Model name and token usage are stored with the result.

## Spend and security gate
Actual model execution requires `MUSE_INTELLIGENCE_ENABLED=true` plus an AI Gateway credential (`AI_GATEWAY_API_KEY` or Vercel OIDC token). The default is locked. This prevents the new route from becoming an accidental token-spending surface before the Artist deliberately enables it and the deployment has an appropriate access policy.

Default model: `openai/gpt-5.6-sol` unless overridden by `MUSE_INTELLIGENCE_MODEL`.

## Council Knowledge Vault
The Knowledge Vault stores compact, auditable retrieval capsules. It does not fine-tune model weights.

Each capsule records:
- title and concise content
- knowledge kind (`artist_directive`, `decision`, `verified_fact`, `reference`, or `working_context`)
- source and source reference
- optional category and Muse recipients
- tags
- whether Brandon verified the entry

The first canonical seed comes from the Nine Muses Master Operating Reference and includes only durable project instructions and decisions useful to Council reasoning.

## ChatGPT Project boundary
Wizard OS does not assume direct external access to the ChatGPT Nine Muses Project. Relevant project information should be distilled into Knowledge Capsules with provenance. This preserves control, avoids dumping entire conversations into prompts, and keeps the system auditable.

## Authority
Brandon remains the Artist Gate. Stage III-E increases reasoning depth, not autonomous authority.
