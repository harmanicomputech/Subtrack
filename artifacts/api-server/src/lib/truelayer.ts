/**
 * TrueLayer Open Banking client.
 *
 * All configuration is read from truelayerConfig.ts — switching between
 * sandbox and production requires only a TRUELAYER_ENV env var change.
 *
 * Sandbox uses TrueLayer's "mock" provider which returns realistic UK bank
 * data (accounts, transactions, balances) without touching real banks.
 * The OAuth flow, token format, and data schema are identical to production.
 */

import { logger } from "./logger";
import { getTrueLayerConfig, type TrueLayerEnvironment } from "./truelayerConfig";

// ── OAuth State management (CSRF protection) ──────────────────────────────────

interface PendingAuth {
  userId: number;
  createdAt: number;
}

const pendingAuthStates = new Map<string, PendingAuth>();
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Create and store a new CSRF state token for a pending OAuth flow.
 * Returns the opaque state string to embed in the TrueLayer redirect URL.
 */
export function createAuthState(userId: number): string {
  // Prune expired states opportunistically
  const now = Date.now();
  for (const [k, v] of pendingAuthStates) {
    if (now - v.createdAt > STATE_TTL_MS) pendingAuthStates.delete(k);
  }
  const state = generateSecureToken();
  pendingAuthStates.set(state, { userId, createdAt: now });
  return state;
}

/**
 * Validate and consume a state token. Returns the userId it was associated
 * with, or null if the state is unknown or expired.
 */
export function consumeAuthState(state: string): number | null {
  const entry = pendingAuthStates.get(state);
  if (!entry) return null;
  pendingAuthStates.delete(state);
  if (Date.now() - entry.createdAt > STATE_TTL_MS) return null;
  return entry.userId;
}

function generateSecureToken(): string {
  // Use crypto.getRandomValues for a cryptographically secure token
  const bytes = new Uint8Array(24);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return Buffer.from(bytes).toString("hex");
}

// ── Auth URL generation ───────────────────────────────────────────────────────

/**
 * Build the TrueLayer authorization URL to redirect the user to.
 *
 * In sandbox mode this points to auth.truelayer-sandbox.com with provider=mock,
 * which presents a realistic UK bank consent screen using test data.
 *
 * In production mode this points to auth.truelayer.com where the user selects
 * their real UK bank from the full provider list.
 */
export function buildAuthUrl(state: string): string {
  const cfg = getTrueLayerConfig();
  const params = new URLSearchParams({
    response_type: "code",
    client_id: cfg.clientId,
    scope: "info accounts balance transactions offline_access",
    redirect_uri: cfg.redirectUri,
    providers: cfg.providers,
    state,
  });
  const url = `${cfg.authBase}/?${params.toString()}`;
  logger.info({ environment: cfg.environment, providers: cfg.providers }, "TrueLayer auth URL built");
  return url;
}

// ── Token exchange ────────────────────────────────────────────────────────────

export interface TrueLayerTokens {
  accessToken: string;
  refreshToken: string;
  /** Seconds until the access token expires (typically 3600) */
  expiresIn: number;
  tokenType: string;
  /** The environment this token was issued in */
  environment: TrueLayerEnvironment;
}

/**
 * Exchange an authorization code for access + refresh tokens.
 * Called once from the /api/bank/callback route after user consent.
 */
export async function exchangeCode(code: string): Promise<TrueLayerTokens> {
  const cfg = getTrueLayerConfig();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    code,
    redirect_uri: cfg.redirectUri,
  });

  const res = await fetch(`${cfg.authBase}/connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    logger.error({ status: res.status, body: text, environment: cfg.environment }, "TrueLayer token exchange failed");
    throw new Error(`TrueLayer token exchange failed [${cfg.environment}]: ${res.status} — ${text}`);
  }

  const data = await res.json() as Record<string, unknown>;
  return {
    accessToken: data.access_token as string,
    refreshToken: data.refresh_token as string,
    expiresIn: data.expires_in as number,
    tokenType: data.token_type as string,
    environment: cfg.environment,
  };
}

/**
 * Use a stored refresh token to obtain a new access token.
 * TrueLayer may rotate the refresh token — always store the returned value.
 */
export async function refreshAccessToken(
  encryptedRefreshToken: string,
  environment: TrueLayerEnvironment,
): Promise<TrueLayerTokens> {
  const cfg = getTrueLayerConfig();

  // Warn if trying to refresh a token from a different environment
  if (cfg.environment !== environment) {
    logger.warn(
      { stored: environment, active: cfg.environment },
      "Token environment mismatch — stored token may not be compatible with active config",
    );
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    refresh_token: encryptedRefreshToken,
  });

  const res = await fetch(`${cfg.authBase}/connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    logger.error({ status: res.status, environment: cfg.environment }, "TrueLayer token refresh failed");
    throw new Error(`TrueLayer token refresh failed [${cfg.environment}]: ${res.status}`);
  }

  const data = await res.json() as Record<string, unknown>;
  return {
    accessToken: data.access_token as string,
    refreshToken: (data.refresh_token as string) ?? encryptedRefreshToken,
    expiresIn: data.expires_in as number,
    tokenType: data.token_type as string,
    environment: cfg.environment,
  };
}

// ── Data API ──────────────────────────────────────────────────────────────────

export interface TrueLayerProvider {
  provider_id: string;
  display_name: string;
  logo_uri?: string;
}

export interface TrueLayerAccount {
  account_id: string;
  account_type: string;
  display_name: string;
  currency: string;
  provider: TrueLayerProvider;
}

export interface TrueLayerTransaction {
  transaction_id: string;
  timestamp: string;
  description: string;
  transaction_type: string;
  transaction_category: string;
  amount: number;
  currency: string;
  merchant_name?: string;
  meta?: {
    provider_transaction_category?: string;
  };
}

/**
 * Fetch all accounts for the authenticated user via TrueLayer Data API.
 */
export async function getAccounts(accessToken: string): Promise<TrueLayerAccount[]> {
  const cfg = getTrueLayerConfig();
  const res = await fetch(`${cfg.dataBase}/data/v1/accounts`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text();
    logger.error({ status: res.status, environment: cfg.environment }, "TrueLayer getAccounts failed");
    throw new Error(`TrueLayer getAccounts failed [${cfg.environment}]: ${res.status} — ${text}`);
  }

  const data = await res.json() as { results: TrueLayerAccount[] };
  return data.results ?? [];
}

/**
 * Fetch transactions for a single account over a date range (up to 12 months).
 */
export async function getTransactions(
  accessToken: string,
  accountId: string,
  from: Date,
  to: Date,
): Promise<TrueLayerTransaction[]> {
  const cfg = getTrueLayerConfig();
  const params = new URLSearchParams({
    from: from.toISOString(),
    to: to.toISOString(),
  });

  const url = `${cfg.dataBase}/data/v1/accounts/${accountId}/transactions?${params}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text();
    logger.error({ status: res.status, accountId, environment: cfg.environment }, "TrueLayer getTransactions failed");
    throw new Error(`TrueLayer getTransactions failed [${cfg.environment}]: ${res.status} — ${text}`);
  }

  const data = await res.json() as { results: TrueLayerTransaction[] };
  return data.results ?? [];
}

// ── Normalisation helpers ─────────────────────────────────────────────────────

/**
 * Extract a clean merchant name from a TrueLayer transaction.
 * Prefers the structured merchant_name field; falls back to cleaned description.
 */
export function normalizeMerchantName(tx: TrueLayerTransaction): string {
  if (tx.merchant_name?.trim()) return tx.merchant_name.trim();

  let name = tx.description;
  name = name
    .replace(/\b\d{4,}\b/g, "")
    .replace(/\b(GBR|UK|LONDON|MANCHESTER|EDINBURGH|BIRMINGHAM)\b/gi, "")
    .replace(/\s+(LTD|LIMITED|PLC|LLC)\b/gi, "")
    .replace(/^(CARD PAYMENT TO|DIRECT DEBIT|DD\s+|CLP\s+|SO\s+)/i, "")
    .replace(/\s+/g, " ")
    .trim();

  return name || tx.description;
}

/**
 * Map a TrueLayer transaction category to SubTrack's category labels.
 */
export function mapCategory(txCategory: string): string {
  const map: Record<string, string> = {
    ENTERTAINMENT: "Entertainment",
    EATING_OUT: "Food & Drink",
    SHOPPING: "Shopping",
    TRANSPORT: "Transport",
    BILLS: "Bills & Utilities",
    UTILITIES: "Bills & Utilities",
    HEALTH: "Health & Fitness",
    TECHNOLOGY: "Technology",
    EDUCATION: "Education",
    BUSINESS: "Business",
    INCOME: "Income",
    SAVINGS: "Savings",
  };
  return map[txCategory?.toUpperCase()] ?? "Other";
}

/**
 * Returns true if the current environment's credentials are configured.
 */
export function isTrueLayerConfigured(): boolean {
  return getTrueLayerConfig().isConfigured;
}
