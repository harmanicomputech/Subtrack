// ── Centralised billing state — single source of truth for the UI ─────────────
//
// All components that need to READ billing state must go through here.
// Only the dashboard enforcement effect WRITES to localStorage (via API check).
// This module never redirects, never blocks, never enforces.

export type BillingState = "subscribed" | "skipped" | "loading" | "none";

export type BillingEventType =
  | "subscription_started"
  | "subscription_cancelled"
  | "billing_skipped"
  | "upgrade_clicked"
  | "upgrade_prompt_clicked"
  | "subscription_page_viewed";

export interface BillingEvent {
  type: BillingEventType;
  timestamp: number;
  label: string;
}

const BILLING_EVENTS_KEY = "recuris_billing_events";
const MAX_EVENTS = 50;

// ── State helpers ─────────────────────────────────────────────────────────────

/**
 * Returns true only when the user holds an active Pro subscription.
 * Use this as the single gate for all premium feature checks in the UI.
 * Never enforce access control here — that belongs to the billing guard on dashboard.
 */
export function isProFeatureAllowed(): boolean {
  return getBillingState() === "subscribed";
}

/**
 * Reads the current billing state synchronously from localStorage.
 * Returns "loading" when no flag is set (API check may still be in flight).
 * Returns "none" only after the API has confirmed no active subscription
 * and no skip flag — the dashboard writes that via setBillingMode.
 */
export function getBillingState(): BillingState {
  if (localStorage.getItem("recuris_subscribed") === "1") return "subscribed";
  if (localStorage.getItem("recuris_billing_skipped") === "1") return "skipped";
  return "loading";
}

// ── Event tracker ─────────────────────────────────────────────────────────────

/**
 * Records a billing event both locally (immediate, offline-safe) and on the
 * server (fire-and-forget — never blocks the calling flow).
 */
export function trackBillingEvent(type: BillingEventType, label: string): void {
  // 1. Synchronous localStorage write — always succeeds offline
  try {
    const raw = localStorage.getItem(BILLING_EVENTS_KEY) ?? "[]";
    const events: BillingEvent[] = JSON.parse(raw);
    events.push({ type, timestamp: Date.now(), label });
    if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
    localStorage.setItem(BILLING_EVENTS_KEY, JSON.stringify(events));
  } catch {
    // Silently ignore storage errors
  }

  // 2. Fire-and-forget server write — never throws, never awaited
  const token = localStorage.getItem("recuris_token");
  if (token) {
    fetch("/api/billing/events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ type, label }),
    }).catch(() => {
      // Server write failed — localStorage already has the event
    });
  }
}

// ── Event readers ─────────────────────────────────────────────────────────────

/** Synchronous local read — used as initial state and offline fallback. */
export function getBillingEventsLocal(): BillingEvent[] {
  try {
    const raw = localStorage.getItem(BILLING_EVENTS_KEY) ?? "[]";
    return (JSON.parse(raw) as BillingEvent[]).slice().reverse(); // newest first
  } catch {
    return [];
  }
}

/**
 * Async read — tries the server first; falls back to localStorage on any error.
 * Server events are authoritative and cross-device.
 */
export async function getBillingEventsFromApi(): Promise<BillingEvent[]> {
  const token = localStorage.getItem("recuris_token");
  if (!token) return getBillingEventsLocal();

  try {
    const res = await fetch("/api/billing/events", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return getBillingEventsLocal();

    const data: Array<{ type: string; label: string | null; createdAt: string }> = await res.json();
    return data.map((ev) => ({
      type: ev.type as BillingEventType,
      timestamp: new Date(ev.createdAt).getTime(),
      label: ev.label ?? "",
    }));
  } catch {
    return getBillingEventsLocal();
  }
}

/** @deprecated Use getBillingEventsFromApi() for the subscription page; getBillingEventsLocal() elsewhere. */
export function getBillingEvents(): BillingEvent[] {
  return getBillingEventsLocal();
}
