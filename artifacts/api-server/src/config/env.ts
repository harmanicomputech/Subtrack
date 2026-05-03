/**
 * Central environment configuration for the Recuris API server.
 *
 * All process.env access should go through this module.
 * Compatible with Railway, Vercel, and any standard Node.js deployment.
 *
 * Required variables must be set at runtime — startup will throw if missing.
 * Optional variables use safe defaults where appropriate.
 */

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required environment variable: ${key}`);
  return val;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const env = {
  // ── Infrastructure ───────────────────────────────────────────────────────
  DATABASE_URL: required("DATABASE_URL"),
  SESSION_SECRET: required("SESSION_SECRET"),
  NODE_ENV: optional("NODE_ENV", "development"),
  PORT: optional("PORT", "3000"),

  // ── Admin ────────────────────────────────────────────────────────────────
  ADMIN_SECRET_KEY: required("ADMIN_SECRET_KEY"),

  // ── TrueLayer (Open Banking) ─────────────────────────────────────────────
  /** "sandbox" (default) | "production" */
  TRUELAYER_ENV: optional("TRUELAYER_ENV", "sandbox"),
  TRUELAYER_CLIENT_ID: optional("TRUELAYER_CLIENT_ID", ""),
  TRUELAYER_CLIENT_SECRET: optional("TRUELAYER_CLIENT_SECRET", ""),
  TRUELAYER_REDIRECT_URI: optional("TRUELAYER_REDIRECT_URI", ""),

  // ── Billing ──────────────────────────────────────────────────────────────
  /** "stripe" | "paystack" */
  PAYMENT_PROVIDER: optional("PAYMENT_PROVIDER", "stripe"),
  /** "demo" | "live" — controls Stripe test vs real mode */
  STRIPE_MODE: optional("STRIPE_MODE", "demo"),
  STRIPE_SECRET_KEY: optional("STRIPE_SECRET_KEY", ""),
  STRIPE_PRICE_ID: optional("STRIPE_PRICE_ID", ""),
  STRIPE_WEBHOOK_SECRET: optional("STRIPE_WEBHOOK_SECRET", ""),
  PAYSTACK_SECRET_KEY: optional("PAYSTACK_SECRET_KEY", ""),

  // ── Google / Gmail ───────────────────────────────────────────────────────
  GOOGLE_CLIENT_ID: optional("GOOGLE_CLIENT_ID", ""),
  GOOGLE_CLIENT_SECRET: optional("GOOGLE_CLIENT_SECRET", ""),

  // ── Misc ─────────────────────────────────────────────────────────────────
  ENCRYPTION_KEY: optional("ENCRYPTION_KEY", ""),
  REPLIT_DOMAINS: optional("REPLIT_DOMAINS", ""),
} as const;
