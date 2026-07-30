# CodePay Client Billing App

Internal billing system for CodePay's SaaS fee management. Replaces the manual Lark spreadsheet with a proper calculation engine, PayPilot import pipeline, and charge status tracking.

## Stack

- **Frontend**: Next.js 14 (App Router) + Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: PostgreSQL (Vercel Postgres / Neon / Supabase)
- **Deployment**: Vercel

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Set up environment
cp .env.example .env
# Edit .env with your DATABASE_URL

# 3. Run migrations
npm run db:migrate

# 4. Seed with real client data
npm run db:seed

# 5. Start dev server
npm run dev
```

## Deploy to Vercel

1. Push this repo to GitHub
2. Import into Vercel
3. Add `DATABASE_URL` as an environment variable (use Vercel Postgres or connect external Neon/Supabase)
4. Deploy — Vercel handles the build automatically
5. After first deploy, run migrations:
   ```bash
   vercel env pull .env.local
   npm run db:migrate
   npm run db:seed
   ```

## Architecture

### Pages
| Route | Purpose |
|-------|---------|
| `/` | Dashboard — revenue summary, pending/overdue counts, recent activity |
| `/clients` | Client list with rate plans, search/filter |
| `/clients/[id]` | Client detail — rate plan history, billing history, child accounts |
| `/import` | Upload PayPilot export, auto-filter test transactions, review flagged items |
| `/billing-run` | Monthly billing grid — enter/confirm active units, finalize charges |
| `/charges` | All charges with status transitions (pending → charged → paid) |
| `/export` | CSV export in 3 formats: spreadsheet-mirror, accounting, raw import |

### Calculation Engine (`src/lib/calc-engine.ts`)
- `flat_per_unit`: units × rate
- `tiered_per_unit`: first N at tier_1_rate, remainder at tier_2_rate
- Cap enforcement (per_client)
- Effective-dated rate plans (never overwrite history)

### Test Transaction Filter (`src/lib/test-filter.ts`)
- **Tier 1 (auto-exclude)**: merchant_receivable = $0 AND purchase_amount ≤ $1
- **Tier 2 (flag for review)**: merchant_receivable = $0 AND all purchases refunded AND amount > $1
- **Active**: everything else with positive merchant receivable

### Key Design Decisions
- `charges` and `payments` merged into single table (spec §8 simplification)
- Parent/child consolidation: child's usage tracked but charge marked `consolidated`
- Usage source tracked (`imported` / `manual` / `imported_overridden`) per spec §3e
- Rate plans are effective-dated, never edited — new row for rate changes
- Variance between calculated_total and amount_charged requires a reason

## Data Model

See `src/lib/schema.sql` for the full schema. Core tables:
- `clients` — with parent/child relationships
- `rate_plans` — effective-dated pricing rules
- `terminal_client_map` — PayPilot terminal → billing client mapping
- `paypilot_imports` / `paypilot_transactions` — import batches + raw data
- `usage_records` — monthly active unit counts per client
- `charges` — billing events with status machine
