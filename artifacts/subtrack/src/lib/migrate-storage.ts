/**
 * One-time localStorage/sessionStorage key migration: SubTrack → Recuris
 *
 * Runs automatically when this module is first imported.
 * For each renamed key:
 *   1. If the OLD key exists, copy its value to the NEW key (only if new key is not already set)
 *   2. Remove the OLD key
 *
 * This preserves all existing user state (auth tokens, billing flags, etc.)
 * while transparently upgrading to the new key names.
 */

const LOCAL_MIGRATIONS: [string, string][] = [
  ["subtrack_token",                "recuris_token"],
  ["subtrack_onboarding_done",      "recuris_onboarding_done"],
  ["subtrack_subscribed",           "recuris_subscribed"],
  ["subtrack_billing_skipped",      "recuris_billing_skipped"],
  ["subtrack_firstrun_dismissed",   "recuris_firstrun_dismissed"],
  ["subtrack_billing_events",       "recuris_billing_events"],
];

const SESSION_MIGRATIONS: [string, string][] = [
  ["subtrack_from_onboarding", "recuris_from_onboarding"],
];

export function migrateStorageKeys(): void {
  try {
    for (const [oldKey, newKey] of LOCAL_MIGRATIONS) {
      const value = localStorage.getItem(oldKey);
      if (value !== null) {
        if (localStorage.getItem(newKey) === null) {
          localStorage.setItem(newKey, value);
        }
        localStorage.removeItem(oldKey);
      }
    }
    for (const [oldKey, newKey] of SESSION_MIGRATIONS) {
      const value = sessionStorage.getItem(oldKey);
      if (value !== null) {
        if (sessionStorage.getItem(newKey) === null) {
          sessionStorage.setItem(newKey, value);
        }
        sessionStorage.removeItem(oldKey);
      }
    }
  } catch {
    // Storage may be unavailable in some browser contexts — fail silently
  }
}

// Auto-run on first import so callers don't need to remember to call it
migrateStorageKeys();
