/**
 * MockTrueLayerProvider
 *
 * A production-grade mock that implements the same interface as the real
 * TrueLayer client. Active when TRUELAYER_ENV === "sandbox" or when real
 * credentials are not configured.
 *
 * Generates realistic UK Open Banking data:
 *   - Barclays current account with 6 months of transaction history
 *   - Recurring subscription payments with consistent billing dates
 *   - Realistic one-off UK merchant transactions
 *   - All amounts in GBP
 *
 * The OAuth simulation bypasses TrueLayer's auth server but uses the identical
 * state/callback/redirect pattern, so the frontend flow is unchanged.
 */

import type { TrueLayerAccount, TrueLayerTransaction } from "./truelayer";

// ── Mock provider metadata ────────────────────────────────────────────────────

export const MOCK_PROVIDER: TrueLayerAccount["provider"] = {
  provider_id: "mock-barclays",
  display_name: "Barclays (Test Data)",
  logo_uri: "https://truelayer-provider-assets.b-cdn.net/global/logos/barclays.svg",
};

export const MOCK_ACCOUNTS: TrueLayerAccount[] = [
  {
    account_id: "mock-barclays-current-01",
    account_type: "TRANSACTION",
    display_name: "Barclays Current Account",
    currency: "GBP",
    provider: MOCK_PROVIDER,
  },
];

// ── Mock transaction data ─────────────────────────────────────────────────────

/**
 * Recurring subscription merchants — billed on consistent day of month.
 * Format: { name, amount, dayOfMonth, category, description }
 */
const SUBSCRIPTIONS = [
  { name: "Netflix",          amount: 10.99, day: 14, cat: "ENTERTAINMENT",  desc: "NETFLIX.COM" },
  { name: "Spotify",          amount: 9.99,  day: 1,  cat: "ENTERTAINMENT",  desc: "SPOTIFY AB" },
  { name: "Amazon Prime",     amount: 8.99,  day: 5,  cat: "SHOPPING",       desc: "AMAZON PRIME SUBSCRIPTION" },
  { name: "Disney+",          amount: 4.99,  day: 10, cat: "ENTERTAINMENT",  desc: "DISNEY PLUS" },
  { name: "Sky Sports",       amount: 44.00, day: 1,  cat: "ENTERTAINMENT",  desc: "SKY DIGITAL" },
  { name: "PureGym",          amount: 29.99, day: 28, cat: "HEALTH",         desc: "PUREGYM LIMITED" },
  { name: "Apple iCloud+",    amount: 2.99,  day: 3,  cat: "TECHNOLOGY",     desc: "APPLE.COM/BILL" },
  { name: "Microsoft 365",    amount: 7.99,  day: 15, cat: "TECHNOLOGY",     desc: "MICROSOFT*365" },
  { name: "NowTV",            amount: 9.99,  day: 20, cat: "ENTERTAINMENT",  desc: "NOWTV ENTERTAINMENT" },
  { name: "BT Broadband",     amount: 40.00, day: 12, cat: "UTILITIES",      desc: "BT GROUP PLC" },
  { name: "Headspace",        amount: 9.99,  day: 7,  cat: "HEALTH",         desc: "HEADSPACE INC" },
  { name: "Adobe CC",         amount: 54.98, day: 18, cat: "TECHNOLOGY",     desc: "ADOBE SYSTEMS" },
  { name: "Deliveroo Plus",   amount: 3.99,  day: 22, cat: "EATING_OUT",     desc: "DELIVEROO PLUS" },
  { name: "iPlayer/BBC",      amount: 13.25, day: 1,  cat: "ENTERTAINMENT",  desc: "TV LICENCE" },
] as const;

/**
 * One-off UK merchant transactions — added with some randomness for realism.
 */
const ONE_OFFS = [
  { name: "Sainsbury's",    minAmt: 25,  maxAmt: 95,  cat: "SHOPPING",    desc: "SAINSBURYS SUPERSTORE" },
  { name: "Tesco",          minAmt: 18,  maxAmt: 75,  cat: "SHOPPING",    desc: "TESCO STORES LTD" },
  { name: "Costa Coffee",   minAmt: 3.5, maxAmt: 6.5, cat: "EATING_OUT",  desc: "COSTA COFFEE" },
  { name: "TfL",            minAmt: 2.4, maxAmt: 6.8, cat: "TRANSPORT",   desc: "TFL TRAVEL" },
  { name: "Deliveroo",      minAmt: 12,  maxAmt: 38,  cat: "EATING_OUT",  desc: "DELIVEROO" },
  { name: "Boots",          minAmt: 6,   maxAmt: 32,  cat: "SHOPPING",    desc: "BOOTS THE CHEMIST" },
  { name: "Amazon",         minAmt: 9,   maxAmt: 120, cat: "SHOPPING",    desc: "AMAZON PAYMENTS" },
  { name: "Pret a Manger",  minAmt: 5,   maxAmt: 11,  cat: "EATING_OUT",  desc: "PRET A MANGER" },
  { name: "Uber",           minAmt: 7,   maxAmt: 25,  cat: "TRANSPORT",   desc: "UBER *TRIP" },
  { name: "Waitrose",       minAmt: 20,  maxAmt: 65,  cat: "SHOPPING",    desc: "WAITROSE & PARTNERS" },
  { name: "Argos",          minAmt: 15,  maxAmt: 80,  cat: "SHOPPING",    desc: "ARGOS LIMITED" },
  { name: "EDF Energy",     minAmt: 72,  maxAmt: 110, cat: "UTILITIES",   desc: "EDF ENERGY" },
  { name: "JUST EAT",       minAmt: 14,  maxAmt: 40,  cat: "EATING_OUT",  desc: "JUST EAT" },
  { name: "Revolut",        minAmt: 20,  maxAmt: 200, cat: "TRANSFER",    desc: "REVOLUT*TOPUP" },
  { name: "Lloyds TSB",     minAmt: 50,  maxAmt: 200, cat: "TRANSFER",    desc: "TRANSFER TO SAVINGS" },
] as const;

// ── Deterministic pseudo-random (seeded) ─────────────────────────────────────
// Using a seeded PRNG so each user always gets the same mock dataset —
// important for consistent deduplication across syncs.

function seededRand(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return ((s >>> 0) / 0x100000000);
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns mock TrueLayer accounts (always Barclays current account).
 */
export function getMockAccounts(): TrueLayerAccount[] {
  return MOCK_ACCOUNTS;
}

/**
 * Generates a realistic 6-month transaction history for the mock account.
 * Results are deterministic for the same date range, ensuring stable
 * deduplication across re-syncs.
 */
export function getMockTransactions(from: Date, to: Date): TrueLayerTransaction[] {
  const rand = seededRand(20240101); // fixed seed for consistency
  const txs: TrueLayerTransaction[] = [];
  let txIndex = 0;

  const makeId = (prefix: string, date: Date, idx: number) =>
    `mock-${prefix}-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}-${idx}`;

  // ── Recurring subscriptions ───────────────────────────────────────────────
  for (const sub of SUBSCRIPTIONS) {
    // Walk month by month from `from` to `to`
    const cursor = new Date(from.getFullYear(), from.getMonth(), sub.day);
    // Move to first valid billing date within range
    while (cursor < from) cursor.setMonth(cursor.getMonth() + 1);

    while (cursor <= to) {
      // Tiny jitter ±0-2 hours so timestamps aren't identical across accounts
      const jitterMs = Math.floor(rand() * 2 * 60 * 60 * 1000);
      const ts = new Date(cursor.getTime() + jitterMs);

      txs.push({
        transaction_id: makeId(sub.name.replace(/\s+/g, "-").toLowerCase(), ts, txIndex++),
        timestamp: ts.toISOString(),
        description: sub.desc,
        merchant_name: sub.name,
        transaction_type: "DEBIT",
        transaction_category: sub.cat,
        amount: -sub.amount, // TrueLayer debits are negative
        currency: "GBP",
      });

      cursor.setMonth(cursor.getMonth() + 1);
    }
  }

  // ── One-off transactions ──────────────────────────────────────────────────
  // Spread ~3–6 one-offs per week across the date range
  const rangeDays = Math.ceil((to.getTime() - from.getTime()) / 86_400_000);
  const totalOneOffs = Math.floor(rangeDays * 0.6); // ~0.6 per day on average

  for (let i = 0; i < totalOneOffs; i++) {
    const merchant = ONE_OFFS[Math.floor(rand() * ONE_OFFS.length)];
    const dayOffset = Math.floor(rand() * rangeDays);
    const ts = new Date(from.getTime() + dayOffset * 86_400_000);
    const range = merchant.maxAmt - merchant.minAmt;
    const amount = Number((merchant.minAmt + rand() * range).toFixed(2));

    txs.push({
      transaction_id: makeId(merchant.name.replace(/\s+/g, "-").toLowerCase(), ts, txIndex++),
      timestamp: ts.toISOString(),
      description: merchant.desc,
      merchant_name: merchant.name,
      transaction_type: "DEBIT",
      transaction_category: merchant.cat,
      amount: -amount,
      currency: "GBP",
    });
  }

  // Sort chronologically (oldest first)
  txs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  return txs;
}

/**
 * Returns the mock OAuth callback URL — a path on our own API server.
 * The browser is redirected here, we process it internally, and redirect
 * back to the app. Identical pattern to real TrueLayer OAuth.
 */
export function getMockAuthUrl(state: string): string {
  // Use a relative URL so it works in any environment (dev, deployed, etc.)
  return `/api/bank/mock-callback?state=${encodeURIComponent(state)}`;
}
