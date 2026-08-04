# CodePay Client Billing App

Internal billing system for CodePay's SaaS fee management. Replaces the manual Lark spreadsheet with a proper calculation engine, PayPilot import pipeline, and charge status tracking.

## Stack

- **Frontend + Backend**: Next.js 14 (App Router) + Tailwind CSS
- **Database**: PostgreSQL (Supabase)
- **Hosting**: Vercel
- **Code**: GitHub

## Setup (No Terminal Required)

### Step 1: Push to GitHub
Upload the entire `codepay-billing/` folder as a GitHub repository.

### Step 2: Connect Vercel
1. Go to [vercel.com](https://vercel.com), import the GitHub repo
2. If `codepay-billing/` is a subfolder in a larger repo, set **Root Directory** to `codepay-billing` in Project Settings → General
3. Add environment variable: `DATABASE_URL` = your Supabase connection string
4. Deploy — Vercel handles the build automatically

### Step 3: Set Up Database (Supabase SQL Editor)
Run these in order in Supabase's **SQL Editor** (no terminal needed):

1. **Create schema**: Copy-paste the entire contents of `src/lib/schema.sql` and execute
2. **Seed clients**: Copy-paste the client INSERT statements from `scripts/seed.js` (the `clients` array section) — or run the seed script if you prefer terminal
3. **Load historical data**: Copy-paste the entire contents of `scripts/seed-historical.sql` and execute

### Step 4: Done
Visit your Vercel URL. The app is live with all historical billing data.

---

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

---

## Optional: Local Development (if you want to run it on your machine)

```bash
npm install
cp .env.example .env   # Add your Supabase DATABASE_URL
npm run dev
```

## Optional: Terminal-based DB setup

```bash
npm run db:migrate     # Runs schema.sql against DATABASE_URL
npm run db:seed        # Seeds clients + rate plans
```
