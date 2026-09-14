# Database migrations and deployment

Wizard OS deliberately does **not** run `prisma migrate deploy` inside `npm run build`.

Vercel may build multiple previews and production deployments concurrently. Running migrations from every build makes those deployments compete for Prisma's PostgreSQL advisory lock and can fail with `P1002` even when the application code is valid.

## Build responsibility

`npm run build` only generates the Prisma client and builds Next.js:

```sh
prisma generate && next build
```

## CI responsibility

GitHub Actions uses an isolated PostgreSQL service. The workflow explicitly runs:

```sh
npm run db:deploy
npm run build
```

This validates all committed migrations without touching the production database.

## Production migration responsibility

When a release includes a new committed Prisma migration, run exactly one controlled production migration before or as part of that release:

```sh
npm run db:deploy
```

Do not run multiple production migration jobs concurrently.

Museum Stage 4 does not include a Prisma migration, so no production database migration is required for that release.
