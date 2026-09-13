# Wizard OS

Wizard OS is a private, desktop-first progressive web app for running a portfolio of businesses, income streams, creative work, and experiments from one command center.

The goal is simple: reduce dependence on active labor by making revenue, recurring income, ventures, customers, projects, inventory, and next-best actions visible in one place.

## Product principles

- **Freedom over busyness** — prioritize recurring, scalable, and low-maintenance income.
- **One source of truth** — business and creative operations live in one system.
- **Action over dashboards** — every screen should help decide what to do next.
- **Human judgment, automated administration** — Brandon owns taste, relationships, creation, and capital allocation; software handles repetitive work.
- **Private by default** — this begins as a personal operating system, not a public SaaS product.

## MVP modules

1. **Command Center** — cashflow snapshot, recurring-income ratio, active ventures, urgent tasks, and next-best actions.
2. **Money** — income, expenses, profit, source mix, recurring vs active income.
3. **Ventures** — score and compare business ideas using demand, margin, recurrence, automation, defensibility, startup cost, and required hours.
4. **Customers** — lightweight CRM for collectors, clients, leads, and future customers.
5. **Operations** — FlightDeck-inspired job board for quotes, deposits, production, fulfillment, and follow-up.
6. **Inventory** — artwork, products, digital assets, supplies, and sellable inventory.
7. **Projects** — active work, milestones, owners, due dates, and status.
8. **Content** — ideas, production state, publishing, and performance notes.
9. **Automations** — recurring workflows and integration status.
10. **Analytics** — trends across income sources, ventures, customers, and time.

## Current prototype

The current deployable prototype is intentionally narrow: a FlightDeck-style Command Center with demo queue data, operational status chips, core metrics, next-best actions, and income mix. Big Cartel product ingestion and persistent business data come after the UI/workflow review.

## Tech stack

- Next.js 15 + TypeScript
- React 19
- Plain CSS for the current visual prototype
- Next.js App Router
- Web app manifest for installable/standalone behavior
- Vercel-ready configuration
- GitHub Actions build check

Planned data layer: Prisma with SQLite for initial local development and a clean path to Postgres/Supabase later.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Production build

```bash
npm install
npm run build
npm start
```

## Deploy to Vercel

1. Sign in to Vercel with GitHub.
2. Import `MadWizardArt/wizard-os`.
3. Leave the framework preset as **Next.js**.
4. Deploy with the default build settings.
5. After deployment, `/api/health` should return a JSON response with `ok: true`.

Future pushes to `main` can automatically redeploy once the Vercel project is linked.

## Milestone 1

Build a usable local MVP that can:

- create and edit ventures
- record income and expenses
- classify income as active, recurring, or passive-like
- track projects/jobs through a simple workflow
- show a command-center dashboard
- calculate recurring-income percentage and venture opportunity scores
- persist data locally

## Financial objective

The first operating target is **$1,000/month in recurring or low-maintenance non-art income**, followed by $2,500/month and $5,000/month. Wizard OS exists to measure progress toward those thresholds and surface the highest-value next actions.

### Campaigns and Calendar

`/campaigns`, `/calendar`, and `/inventory` use PostgreSQL through the same Prisma client and ledger as work orders and Money. The migration runs during the deployment build. No campaign records, paintings, or financial examples are seeded by migrations.

The one-time **Set up 2026 campaigns** action checks all projects (including archived ones) for `2026 Painting Sales — September + Black Friday — $14000 Goal`. It reuses the earliest matching work order and its notes without changing existing stages. Repeat requests preserve existing campaign edits. The setup creates two proposed campaigns, a 30-unit winter batch and six weekly painting tasks (October 9 through November 13), with a production start of October 5. Additional detailed plan content remains manual.

- Campaign tasks are the calendar's source records. Dates are ISO calendar dates, and optional clock times are Eastern wall times, independent of the browser timezone. All-day tasks become overdue after their Eastern date ends. Sale windows include both endpoints.
- Inventory extends an existing ARTWORK project via a unique `projectId`. Campaign links store only the sale price. Regular prices and global availability live on Painting. New manual paintings receive artwork workflow stages. Batch quantities do not create fictional paintings.
- Record Sale writes an actual received transaction to Money, with a unique request key protecting retries. Link Existing Receipt attaches that existing row, never copies it. Refunds are separate received ledger records. A refund does not automatically restock a painting.
- The editable annual goal defaults to $14,000 due December 31, 2026, counting 2026 gross artwork receipts less refunds, tax and shipping. Artwork receipts are explicitly identified or linked to an ARTWORK project; unclassified art-like entries can be deliberately linked after review. No unpaid amounts, inventory valuations or campaign targets count. Monthly non-art qualifying-income goals are unchanged.
- Facebook drafts have planning dates and Draft/Posted status. Copy text never publishes anything.
- HTTP errors are shown instead of optimistic save confirmations or demonstration data. Reload/focus fetches saved records again. PostgreSQL is required; browser localStorage is not used for this feature.

Validation: `node --experimental-strip-types --test tests/workflow.test.mjs tests/campaign-rules.test.mjs`. CI also applies migrations to a fresh PostgreSQL service, builds the app, and runs campaign API and Chromium reload tests. Integration tests must only run against a disposable test database; they intentionally create test transactions and artwork and leave them for the browser test to inspect.

### Connected artwork lifecycle

Painting availability is the single lifecycle source: Not ready → Works in Progress; Available/Reserved → Available Inventory; Sold → Sold Archive. The dashboard excludes finished paintings from production cards, queue and next actions while work orders remain available for history. Imported Available records require no copying or deletion. New paintings entered in Inventory default to Available; New Work Order can still begin production. Complete Painting records an availability transition without fabricating historic stage completion dates.

Inventory has lifecycle tabs and search, direct completion, campaign linking, costs, sale recording and status corrections. ArtworkSale stores actual agreed sale terms separately from Transaction receipts. Unpaid sales move to Sold but contribute nothing to received-revenue goals. Payments and refunds reference the existing ledger; existing receipts may be linked instead of recreated. Fulfillment is separate from payment and artwork availability.

Profit uses the actual discounted artwork price plus shipping income, less refunds (excluding tax), materials, framing, selling fees and shipping expense. The discount field documents the discount already reflected in the selling price; it is not deducted again. Null costs remain unknown, and profit is provisional until all four cost categories are recorded. Profit from unpaid sale terms is distinct from cash received. Returned/voided sales use net payments retained instead of canceled unpaid sale value. No archive-wide profit total is presented because production costs belong to the artwork, including when it is resold.

Status corrections preserve artwork IDs, production stages, images, campaign links, past sales and receipts. Returning/voiding a sale does not invent a refund: record the actual refund separately. Corrections are recorded in artwork history, and a subsequent resale gets a new sale event on the same painting. The migration adds no sales, payments or assumed costs to live records.
