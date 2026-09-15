# Database migrations and deployment

Wizard OS applies committed Prisma migrations automatically **only during Vercel production builds**.

Preview deployments must never mutate the production schema. GitHub Actions validates migrations against an isolated PostgreSQL service, while the production build uses `scripts/production-migrate.mjs` to run `prisma migrate deploy` only when `VERCEL_ENV=production`.

## Build responsibility

`npm run build` generates the Prisma client, invokes the guarded production migration helper, and builds Next.js:

```sh
prisma generate && node scripts/production-migrate.mjs && next build
```

Outside Vercel production, the migration helper exits without touching the production database.

## CI responsibility

GitHub Actions uses an isolated PostgreSQL service and explicitly applies committed migrations before building and running persistence/security verification. This validates schema changes without touching production.

## Production migration responsibility

On a Vercel production deployment, `scripts/production-migrate.mjs` runs:

```sh
prisma migrate deploy
```

before the Next.js build completes. A failed migration therefore prevents the release from becoming the current production deployment.

## Current audit migrations

Migration `20260915222000_archive_legacy_museum_chambers` archives obsolete `MUSEUM_CHAMBER_V1` Project records so retired per-room AI chat state cannot appear as current operational workload.

Migration `20260915233800_archive_retired_museum_control_planes` archives obsolete `MUSEUM_QUEST_V1`, `MUSEUM_FOCUS_V1`, and `MUSEUM_BRIEF_V1` Project records before their retired routes and storage helpers are removed. Historical records are preserved as archived data rather than silently deleted.

Selective Intelligence, Agency, Cognition, Memory, Knowledge, and Signals remain the supported Museum operating paths.

## Cleanup Pass 1

PR #54 retired the obsolete Quest, Focus, Brief, Chamber, and legacy Museum AI control planes. The release preserves historical records by archiving them, keeps current Stage III systems intact, and adds animation → static room art → symbolic placeholder fallback for Museum portraits.
