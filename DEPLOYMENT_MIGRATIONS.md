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

## Current audit migration

Migration `20260915222000_archive_legacy_museum_chambers` archives obsolete `MUSEUM_CHAMBER_V1` Project records so retired per-room AI chat state cannot appear as current operational workload. The legacy Chamber AI path is retired; Selective Intelligence is the supported powered-reasoning path.
