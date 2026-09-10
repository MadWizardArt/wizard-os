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

## Initial tech direction

- Next.js + TypeScript
- Tailwind CSS
- Prisma ORM
- SQLite for local-first development, with a clean path to Postgres/Supabase later
- PWA support for installable desktop/mobile use
- Recharts for business visualizations
- Zod for runtime validation

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
