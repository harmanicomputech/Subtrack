/**
 * TrueLayer Open Banking routes.
 *
 * GET  /api/bank/connect         → Return auth URL (real TrueLayer OR mock, transparent to frontend)
 * GET  /api/bank/mock-callback   → Internal mock OAuth handler (sandbox/no-credentials mode only)
 * GET  /api/bank/callback        → Real TrueLayer OAuth callback
 * POST /api/bank/sync            → Sync all connected banks (real API or mock data)
 *
 * The mock provider is activated automatically when TRUELAYER_ENV==="sandbox"
 * or when TrueLayer credentials are not configured. Switching to live requires
 * only setting TRUELAYER_ENV=production and providing real credentials.
 */

import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, bankConnectionsTable, transactionsTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { logger } from "../lib/logger";
import { encrypt, decrypt } from "../lib/encryption";
import { getTrueLayerConfig, getCurrentEnvironment, isMockMode } from "../lib/truelayerConfig";
import {
  buildAuthUrl,
  createAuthState,
  consumeAuthState,
  exchangeCode,
  refreshAccessToken,
  getAccounts,
  getTransactions,
  normalizeMerchantName,
  mapCategory,
  type TrueLayerAccount,
} from "../lib/truelayer";
import {
  getMockAuthUrl,
  getMockAccounts,
  getMockTransactions,
  MOCK_PROVIDER,
} from "../lib/mockTruelayer";
import { detectSubscriptions } from "../lib/subscriptionDetector";
import { analyseUserSubscriptions } from "../lib/subscriptionInsights";

const router: IRouter = Router();

// ── GET /api/bank/connect ─────────────────────────────────────────────────────
// Returns the auth URL. In mock mode this is our own /api/bank/mock-callback.
// In production mode this is the real TrueLayer auth URL.
// The frontend always just does: window.location.href = authUrl

router.get("/bank/connect", requireAuth, (req: AuthenticatedRequest, res): void => {
  const cfg = getTrueLayerConfig();
  const state = createAuthState(req.userId!);

  if (isMockMode()) {
    // Sandbox/mock: bypass TrueLayer, use internal mock callback
    res.json({
      configured: true,
      authUrl: getMockAuthUrl(state),
      environment: cfg.environment,
      mockMode: true,
    });
    return;
  }

  // Production: real TrueLayer OAuth
  if (!cfg.isConfigured) {
    res.json({ configured: false, authUrl: "", environment: cfg.environment, mockMode: false });
    return;
  }

  res.json({
    configured: true,
    authUrl: buildAuthUrl(state),
    environment: cfg.environment,
    mockMode: false,
  });
});

// ── GET /api/bank/mock-callback ───────────────────────────────────────────────
// Internal mock OAuth handler — mirrors the real TrueLayer callback pattern.
// Validates state (CSRF), inserts a realistic mock bank connection, seeds 6
// months of UK transaction history, runs subscription detection, then redirects
// back to the app exactly as TrueLayer would.

router.get("/bank/mock-callback", async (req, res): Promise<void> => {
  const { state } = req.query as Record<string, string>;

  const domains = process.env.REPLIT_DOMAINS?.split(",") ?? [];
  const appBase = domains.length > 0 ? `https://${domains[0].trim()}` : "http://localhost:80";
  const bankAccountsUrl = `${appBase}/bank-accounts`;

  if (!state) {
    res.redirect(`${bankAccountsUrl}?error=missing_state`);
    return;
  }

  const userId = consumeAuthState(state);
  if (!userId) {
    logger.warn({ state }, "Mock callback: invalid or expired state");
    res.redirect(`${bankAccountsUrl}?error=invalid_state`);
    return;
  }

  const environment = getCurrentEnvironment();
  const bankName = "Barclays (Test Data)";
  const mockAccessToken = `mock_access_${Date.now()}`;
  const mockRefreshToken = `mock_refresh_${Date.now()}`;
  // Mock tokens "expire" in 1 hour — same as real TrueLayer
  const tokenExpiresAt = new Date(Date.now() + 3600 * 1000);

  logger.info({ userId }, "mock_bank_connect_started");

  try {
    const [conn] = await db.insert(bankConnectionsTable).values({
      userId,
      bankName,
      bankLogo: MOCK_PROVIDER.logo_uri ?? null,
      provider: MOCK_PROVIDER.provider_id,
      providerDisplayName: bankName,
      status: "connected",
      accessToken: encrypt(mockAccessToken),
      refreshToken: encrypt(mockRefreshToken),
      tokenExpiresAt,
      environment,
      lastSyncedAt: null,
    }).returning();

    logger.info({ userId, connectionId: conn.id, environment }, "Mock bank connection created");

    // Await seed synchronously so all data is ready before the browser lands on /bank-accounts.
    // onConflictDoNothing makes re-seeding idempotent.
    try {
      const { synced } = await seedMockTransactions(conn.id, userId);
      logger.info({ connectionId: conn.id, synced }, "mock_bank_transactions_created");

      logger.info({ userId }, "mock_subscription_detection_triggered");
      await detectSubscriptions(userId);
      await analyseUserSubscriptions(userId);

      logger.info({ userId, connectionId: conn.id }, "mock_bank_seed_complete");
    } catch (seedErr) {
      // Connection was created — log failure and let /bank-accounts sync handle recovery
      logger.error({ err: seedErr, connectionId: conn.id }, "Mock seed/detection failed — will retry on next sync");
    }

    res.redirect(
      `${bankAccountsUrl}?success=connected&bank=${encodeURIComponent(bankName)}&env=${environment}&mock=1`,
    );
  } catch (err) {
    logger.error({ err, userId }, "Mock callback: failed to create connection");
    res.redirect(`${bankAccountsUrl}?error=connection_failed`);
  }
});

// ── GET /api/bank/callback ────────────────────────────────────────────────────
// Real TrueLayer OAuth callback — only reached in production mode.

router.get("/bank/callback", async (req, res): Promise<void> => {
  const { code, state, error, error_description } = req.query as Record<string, string>;

  const domains = process.env.REPLIT_DOMAINS?.split(",") ?? [];
  const appBase = domains.length > 0 ? `https://${domains[0].trim()}` : "http://localhost:80";
  const bankAccountsUrl = `${appBase}/bank-accounts`;

  if (error) {
    logger.warn({ error, error_description }, "TrueLayer callback error");
    res.redirect(`${bankAccountsUrl}?error=${encodeURIComponent(error_description ?? error)}`);
    return;
  }

  if (!code || !state) {
    res.redirect(`${bankAccountsUrl}?error=missing_params`);
    return;
  }

  const userId = consumeAuthState(state);
  if (!userId) {
    logger.warn({ state }, "TrueLayer callback: invalid or expired state");
    res.redirect(`${bankAccountsUrl}?error=invalid_state`);
    return;
  }

  const environment = getCurrentEnvironment();

  try {
    const tokens = await exchangeCode(code);

    let accounts: TrueLayerAccount[] = [];
    try {
      accounts = await getAccounts(tokens.accessToken);
    } catch (e) {
      logger.warn({ err: e }, "Could not fetch accounts post-exchange");
    }

    const firstAccount = accounts[0];
    const provider = firstAccount?.provider;
    const bankName = provider?.display_name ?? "Connected Bank";
    const bankLogo = provider?.logo_uri ?? null;
    const providerId = provider?.provider_id ?? null;

    const [conn] = await db.insert(bankConnectionsTable).values({
      userId,
      bankName,
      bankLogo,
      provider: providerId,
      providerDisplayName: bankName,
      status: "connected",
      accessToken: encrypt(tokens.accessToken),
      refreshToken: encrypt(tokens.refreshToken),
      tokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
      environment,
      lastSyncedAt: null,
    }).returning();

    logger.info({ userId, bankName, connectionId: conn.id, environment }, "Real bank connection created");

    syncConnectionTransactions(conn.id, userId, tokens.accessToken, accounts)
      .catch((err) => logger.error({ err, connectionId: conn.id }, "Background sync failed"));

    res.redirect(
      `${bankAccountsUrl}?success=connected&bank=${encodeURIComponent(bankName)}&env=${environment}`,
    );
  } catch (err) {
    logger.error({ err, userId, environment }, "TrueLayer callback failed");
    res.redirect(`${bankAccountsUrl}?error=connection_failed`);
  }
});

// ── POST /api/bank/sync ───────────────────────────────────────────────────────
// Syncs all connected banks. In mock mode, re-generates the same deterministic
// UK transaction dataset (deduplication prevents duplicates). In production,
// calls the real TrueLayer Data API.

router.post("/bank/sync", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const connections = await db
    .select()
    .from(bankConnectionsTable)
    .where(and(
      eq(bankConnectionsTable.userId, req.userId!),
      eq(bankConnectionsTable.status, "connected"),
    ));

  if (connections.length === 0) {
    res.json({ connectionsProcessed: 0, transactionsSynced: 0, subscriptionsDetected: 0, errors: [] });
    return;
  }

  let totalTransactions = 0;
  const errors: string[] = [];

  for (const conn of connections) {
    try {
      let synced = 0;

      if (isMockMode() || conn.provider?.startsWith("mock-")) {
        // ── Mock sync ─────────────────────────────────────────────────────────
        const result = await seedMockTransactions(conn.id, req.userId!);
        synced = result.synced;
      } else {
        // ── Real TrueLayer sync ───────────────────────────────────────────────
        if (!conn.accessToken) {
          errors.push(`Connection ${conn.id} (${conn.bankName}): no access token`);
          continue;
        }

        let accessToken = decrypt(conn.accessToken);
        const cfg = getTrueLayerConfig();

        // Refresh if expiring within 5 minutes
        const expiresAt = conn.tokenExpiresAt?.getTime() ?? 0;
        if (expiresAt < Date.now() + 5 * 60 * 1000) {
          if (!conn.refreshToken) {
            errors.push(`Connection ${conn.id}: token expired, no refresh token`);
            await db.update(bankConnectionsTable)
              .set({ status: "error" })
              .where(eq(bankConnectionsTable.id, conn.id));
            continue;
          }

          const storedEnv = (conn.environment ?? "sandbox") as "sandbox" | "production";
          if (storedEnv !== cfg.environment) {
            errors.push(`Connection ${conn.id}: environment mismatch (stored=${storedEnv}, active=${cfg.environment})`);
            continue;
          }

          const newTokens = await refreshAccessToken(decrypt(conn.refreshToken), storedEnv);
          accessToken = newTokens.accessToken;
          await db.update(bankConnectionsTable).set({
            accessToken: encrypt(newTokens.accessToken),
            refreshToken: encrypt(newTokens.refreshToken),
            tokenExpiresAt: new Date(Date.now() + newTokens.expiresIn * 1000),
          }).where(eq(bankConnectionsTable.id, conn.id));
        }

        const accounts = await getAccounts(accessToken);
        const result = await syncConnectionTransactions(conn.id, req.userId!, accessToken, accounts);
        synced = result;
      }

      totalTransactions += synced;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err, connectionId: conn.id }, "Sync error");
      errors.push(`Connection ${conn.id} (${conn.bankName}): ${msg}`);
      await db.update(bankConnectionsTable)
        .set({ status: "error" })
        .where(eq(bankConnectionsTable.id, conn.id));
    }
  }

  const detectionResult = await detectSubscriptions(req.userId!);
  await analyseUserSubscriptions(req.userId!);

  res.json({
    connectionsProcessed: connections.length,
    transactionsSynced: totalTransactions,
    subscriptionsDetected: detectionResult.detected,
    errors,
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Seeds or re-syncs 6 months of mock UK transaction data for a connection.
 * Uses `onConflictDoNothing` so re-syncing is safe and idempotent.
 */
async function seedMockTransactions(
  connectionId: number,
  userId: number,
): Promise<{ synced: number }> {
  const to = new Date();
  const from = new Date();
  from.setMonth(from.getMonth() - 6);

  const mockTxs = getMockTransactions(from, to);
  let synced = 0;

  for (const tx of mockTxs) {
    // Only store outgoing payments (negative amounts)
    if (tx.amount >= 0) continue;

    const amount = Math.abs(tx.amount);

    await db.insert(transactionsTable).values({
      bankConnectionId: connectionId,
      merchantName: tx.merchant_name ?? tx.description,
      amount: String(amount.toFixed(2)),
      currency: tx.currency ?? "GBP",
      transactionDate: new Date(tx.timestamp),
      category: mapCategory(tx.transaction_category),
      isSubscription: false,
      externalId: tx.transaction_id,
    }).onConflictDoNothing();

    synced++;
  }

  await db.update(bankConnectionsTable)
    .set({ lastSyncedAt: new Date(), status: "connected" })
    .where(eq(bankConnectionsTable.id, connectionId));

  logger.info({ connectionId, userId, synced }, "Mock transaction seed complete");
  return { synced };
}

/**
 * Syncs transactions from the real TrueLayer API for a single bank connection.
 * Fetches 12 months of history; deduplicates via externalId.
 */
async function syncConnectionTransactions(
  connectionId: number,
  userId: number,
  accessToken: string,
  accounts: TrueLayerAccount[],
): Promise<number> {
  const to = new Date();
  const from = new Date();
  from.setMonth(from.getMonth() - 12);

  let synced = 0;

  for (const account of accounts) {
    let txs = [];
    try {
      txs = await getTransactions(accessToken, account.account_id, from, to);
    } catch (err) {
      logger.warn({ err, accountId: account.account_id }, "Could not fetch transactions");
      continue;
    }

    const debits = txs.filter((tx) => tx.amount < 0);

    for (const tx of debits) {
      const amount = Math.abs(tx.amount);
      await db.insert(transactionsTable).values({
        bankConnectionId: connectionId,
        merchantName: normalizeMerchantName(tx),
        amount: String(amount.toFixed(2)),
        currency: tx.currency ?? "GBP",
        transactionDate: new Date(tx.timestamp),
        category: mapCategory(tx.transaction_category),
        isSubscription: false,
        externalId: tx.transaction_id,
      }).onConflictDoNothing();
      synced++;
    }
  }

  await db.update(bankConnectionsTable)
    .set({ lastSyncedAt: new Date(), status: "connected" })
    .where(eq(bankConnectionsTable.id, connectionId));

  logger.info({ connectionId, userId, synced }, "Real sync complete");
  return synced;
}

export default router;
