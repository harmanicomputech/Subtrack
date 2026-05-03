/**
 * TrueLayer environment-aware configuration service.
 *
 * Reads TRUELAYER_ENV to determine which credential set and base URLs to use.
 * Switching from sandbox to production requires only a single env var change —
 * no code changes needed.
 *
 * Environment variables:
 *
 *   TRUELAYER_ENV                   "sandbox" (default) | "production"
 *
 *   TRUELAYER_CLIENT_ID_SANDBOX     Sandbox client ID from console.truelayer.com
 *   TRUELAYER_CLIENT_SECRET_SANDBOX Sandbox client secret
 *
 *   TRUELAYER_CLIENT_ID_PROD        Production client ID
 *   TRUELAYER_CLIENT_SECRET_PROD    Production client secret
 *
 *   TRUELAYER_REDIRECT_URI          Shared — same URI registered in both environments
 *   ENCRYPTION_KEY                  64-char hex — AES-256 key for token encryption
 *
 * Auth URLs:
 *   Sandbox:    https://auth.truelayer-sandbox.com
 *   Production: https://auth.truelayer.com
 *
 * Data API URLs:
 *   Sandbox:    https://api.truelayer-sandbox.com
 *   Production: https://api.truelayer.com
 *
 * Bank providers:
 *   Sandbox:    "mock" (TrueLayer's test bank with realistic UK data)
 *   Production: "uk-ob-all uk-oauth-all" (all UK Open Banking providers)
 */

export type TrueLayerEnvironment = "sandbox" | "production";

export interface TrueLayerConfig {
  environment: TrueLayerEnvironment;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  authBase: string;
  dataBase: string;
  /** Space-separated TrueLayer provider filter */
  providers: string;
  /** True when credentials are configured and integration can run */
  isConfigured: boolean;
}

/**
 * Returns the active TrueLayer config for the current environment.
 * Call this once per request — it reads from process.env each time so the
 * value automatically reflects any runtime env var changes.
 */
export function getTrueLayerConfig(): TrueLayerConfig {
  const rawEnv = (process.env.TRUELAYER_ENV ?? "sandbox").toLowerCase().trim();
  const environment: TrueLayerEnvironment =
    rawEnv === "production" ? "production" : "sandbox";

  const isSandbox = environment === "sandbox";

  const clientId = isSandbox
    ? (process.env.TRUELAYER_CLIENT_ID_SANDBOX ?? "")
    : (process.env.TRUELAYER_CLIENT_ID_PROD ?? "");

  const clientSecret = isSandbox
    ? (process.env.TRUELAYER_CLIENT_SECRET_SANDBOX ?? "")
    : (process.env.TRUELAYER_CLIENT_SECRET_PROD ?? "");

  const redirectUri = process.env.TRUELAYER_REDIRECT_URI ?? "";

  return {
    environment,
    clientId,
    clientSecret,
    redirectUri,
    authBase: isSandbox
      ? "https://auth.truelayer-sandbox.com"
      : "https://auth.truelayer.com",
    dataBase: isSandbox
      ? "https://api.truelayer-sandbox.com"
      : "https://api.truelayer.com",
    // Sandbox: "mock" uses TrueLayer's built-in test bank with realistic UK data
    // Production: all UK Open Banking + OAuth bank providers
    providers: isSandbox ? "mock" : "uk-ob-all uk-oauth-all",
    isConfigured: !!(clientId && clientSecret && redirectUri),
  };
}

/**
 * Returns the current TrueLayer environment label ("sandbox" or "production").
 * Used for storing alongside tokens and for UI display.
 */
export function getCurrentEnvironment(): TrueLayerEnvironment {
  return getTrueLayerConfig().environment;
}

/**
 * Returns true when the system should use the MockTrueLayerProvider instead
 * of making real network calls to TrueLayer.
 *
 * Mock mode is active when:
 *   - TRUELAYER_ENV === "sandbox" (sandbox always uses the mock provider), OR
 *   - Real credentials are not fully configured (missing client ID / secret / redirect URI)
 *
 * This allows full end-to-end local development without any credentials while
 * preserving the production architecture. Switching to live is a one-line env change.
 */
export function isMockMode(): boolean {
  const cfg = getTrueLayerConfig();
  return cfg.environment === "sandbox" || !cfg.isConfigured;
}
