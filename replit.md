# SubTrack — UK Subscription Manager

## Project Overview

SubTrack is a dual-track UK subscription management app:

1. **Live Web App** — React + Express + PostgreSQL (running in Replit preview)
2. **Flutter + Laravel codebase** — Generated production files in `flutter_laravel/` for local use

Both tracks share the same architecture, database structure, API logic, and business rules.

## Core Features

- Register/Login with token-based auth
- Connect bank accounts (simulated Open Banking with seeded UK merchant data)
- Automatic subscription detection engine (Netflix, Spotify, Amazon Prime, Apple, etc.)
- Dashboard: monthly/yearly spend, active subs, savings tracker, upcoming renewals, category pie chart
- Cancellations: initiate via direct debit block, email, or manual — auto-records savings
- Notifications: renewal reminders, cancellation confirmations
- Savings: total saved from all cancelled subscriptions

## Stack

### Web App (Live in Replit)
- **Monorepo**: pnpm workspaces
- **Frontend**: React + Vite + Tailwind CSS v4 + shadcn/ui + Wouter routing
- **Backend**: Express 5 + TypeScript
- **Database**: PostgreSQL + Drizzle ORM
- **API Contract**: OpenAPI spec → Orval codegen → React Query hooks + Zod schemas
- **Auth**: Bearer token (in-memory store, SHA-256 hashed passwords)
- **Token**: `subtrack_token` in localStorage

### Flutter + Laravel (Generated Files)
- **Frontend**: Flutter 3.10+ with Riverpod, GoRouter, Dio, freezed
- **Backend**: Laravel with Sanctum auth, Eloquent ORM
- Located at: `flutter_laravel/flutter/` and `flutter_laravel/laravel/`

## Key Files

| File | Purpose |
|------|---------|
| `lib/api-spec/openapi.yaml` | Source of truth for all API contracts |
| `lib/api-spec/orval.config.ts` | Codegen config |
| `lib/api-zod/src/index.ts` | Must only export from `./generated/api` |
| `artifacts/api-server/src/routes/index.ts` | All routes registered |
| `artifacts/api-server/src/lib/auth.ts` | Token store + SHA-256 password hashing |
| `artifacts/api-server/src/lib/subscriptionDetector.ts` | UK subscription detection engine |
| `lib/db/src/schema/index.ts` | All 7 table schemas |
| `flutter_laravel/flutter/lib/core/api/api_client.dart` | Flutter Dio client (update `_baseUrl` for prod) |

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)

## DB Schema (PostgreSQL)

- `users` — id, name, email, password_hash, created_at
- `bank_connections` — id, user_id, institution_name, account_type, status, last_synced_at
- `transactions` — id, user_id, bank_connection_id, merchant_name, amount, currency, transaction_date, is_subscription
- `subscriptions` — id, user_id, merchant_name, amount, currency, billing_cycle, next_renewal_date, category, status, confidence_score
- `cancellation_requests` — id, user_id, subscription_id, method, status, notes
- `notifications` — id, user_id, type, title, message, is_read
- `savings` — id, user_id, cancellation_request_id, amount_saved, currency, notes

## Billing — Pluggable Provider Architecture

A provider-agnostic billing system supports both Paystack (active) and Stripe (ready). Switch providers by changing one env var — no code changes needed.

### Active Provider: Paystack
Switch via: `PAYMENT_PROVIDER=paystack` (current) or `PAYMENT_PROVIDER=stripe`

**Files:**
- `artifacts/api-server/src/lib/billing/billingProvider.ts` — interface
- `artifacts/api-server/src/lib/billing/paystackProvider.ts` — Paystack implementation
- `artifacts/api-server/src/lib/billing/stripeProvider.ts` — Stripe implementation
- `artifacts/api-server/src/lib/billing/index.ts` — `getBillingProvider()` factory

**API endpoints:**
- `GET /api/billing/status` — live subscription status from DB
- `POST /api/billing/create-checkout-session` — routes to active provider
- `POST /api/webhooks/stripe` — Stripe webhook (HMAC verified)
- `POST /api/webhooks/paystack` — Paystack webhook (HMAC-SHA512 verified)
- `GET /api/billing/paystack/callback` — Paystack post-payment redirect → verifies → `/billing/success`

**Frontend:**
- `PaywallModal` — calls backend, redirects to provider's checkout URL
- `/billing/success` — Pro activation confirmation page

**DB columns on `users`:** `subscription_status`, `subscription_plan`, `billing_provider`, `payment_reference`, `stripe_customer_id`, `stripe_subscription_id`

### Paystack secrets needed (Settings → Secrets):
1. `PAYSTACK_SECRET_KEY` — from paystack.com → Settings → API Keys (starts with `sk_test_` or `sk_live_`)
2. `PAYSTACK_CURRENCY` — optional, defaults to `GBP` (use `NGN` if your account doesn't support GBP)
3. `PAYSTACK_AMOUNT` — optional, defaults to `400` (pence for GBP = £4; for NGN set to kobo amount)

**Webhook URL to register in Paystack:** `https://<your-domain>/api/webhooks/paystack`
**Events:** `charge.success`

### Stripe secrets (for future switch to `PAYMENT_PROVIDER=stripe`):
1. `STRIPE_SECRET_KEY` — from stripe.com → Developers → API keys
2. `STRIPE_WEBHOOK_SECRET` — from stripe.com → Developers → Webhooks signing secret
3. `STRIPE_PRICE_ID` — Price ID for £4/month recurring price

NOTE: Replit Stripe connector was dismissed. Both providers use manual secrets.

---

## Important Notes

- Auth tokens are in-memory and lost on server restart (acceptable for MVP; use DB-backed sessions for production)
- Bank sync seeds realistic UK subscription data: Netflix, Spotify, Amazon Prime, Apple, Disney+, Sky, Gym, Adobe, Audible, Deliveroo Plus, Microsoft
- Flutter `_baseUrl` in `api_client.dart` is placeholder — update to your production API domain
- Vite dev server: Google Fonts loaded via `<link>` in `index.html` (NOT `@import` in CSS — causes PostCSS errors with Tailwind v4)

## Workflows

| Workflow | Command |
|----------|---------|
| `artifacts/api-server: API Server` | `pnpm --filter @workspace/api-server run dev` |
| `artifacts/subtrack: web` | `pnpm --filter @workspace/subtrack run dev` |
| `artifacts/mockup-sandbox: Component Preview Server` | `pnpm --filter @workspace/mockup-sandbox run dev` |
