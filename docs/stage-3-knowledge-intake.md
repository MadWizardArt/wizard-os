# Stage III — Council Knowledge Intake Bridge

Owner: Novy  
Reviewers: Cleo, Melina

## Objective

Allow relevant knowledge distilled from the Nine Muses ChatGPT Project to enter Wizard OS as persistent retrieval memory without assuming direct access to the ChatGPT Project and without allowing external context to silently become Artist-approved truth.

## Flow

`Nine Muses Project → curated capsule → trusted intake → Knowledge Inbox → Artist review → Active Vault → Selective Intelligence`

## Intake contract

`POST /api/museum/knowledge/intake`

A trusted bridge authenticates with `Authorization: Bearer <MUSE_KNOWLEDGE_INGEST_KEY>`.

The request may contain one capsule or up to 20 capsules. A capsule carries:

- `title`
- `content`
- `kind`: artist_directive, decision, verified_fact, reference, or working_context
- `sourceRef`
- optional `category`
- optional `targetMuseIds`
- optional `tags`

Wizard OS forces every external capsule to:

- source = `nine_muses_project`
- `verifiedByArtist = false`
- WAITING status in the Knowledge Inbox

A sender cannot self-assert Artist verification.

## Artist review

The protected Knowledge API accepts Artist-session-only PATCH actions:

- `verify` — admits the capsule to future Muse retrieval
- `archive` — preserves the record but removes it from active Vault and retrieval

## Retrieval rule

Selective Intelligence retrieves **only `verifiedByArtist` capsules**. An unverified item may be stored and visible in the Inbox but is inert for AI context.

## Security

- `MUSE_KNOWLEDGE_INGEST_KEY` must be at least 24 characters.
- The service key is never returned by Wizard OS.
- Bridge configuration status is visible to the authenticated Artist, but the key value is not.
- Artist session remains required to inspect the Vault/Inbox or approve/archive capsules.
- Intake creates no Intelligence Quest and triggers no model call.

## What this is not

This is retrieval memory, not model-weight training. Wizard OS does not assume it can mount or continuously read a ChatGPT Project. A future connector may distill and POST selected capsules through this contract.
