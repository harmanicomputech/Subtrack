const BASE = "/api/admin";
const SESSION_KEY = "recuris_admin_session";

interface AdminSession {
  token: string;
  expiresAt: number; // ms epoch
}

// ── Session storage ───────────────────────────────────────────────────────────

export function getAdminSession(): AdminSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AdminSession;
  } catch {
    return null;
  }
}

export function getAdminToken(): string | null {
  return getAdminSession()?.token ?? null;
}

export function isSessionExpired(): boolean {
  const session = getAdminSession();
  if (!session) return true;
  return Date.now() >= session.expiresAt;
}

export function isSessionNearExpiry(): boolean {
  const session = getAdminSession();
  if (!session) return false;
  return session.expiresAt - Date.now() < 5 * 60 * 1000;
}

export function setAdminSession(token: string, expiresAt: number): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ token, expiresAt }));
}

/** @deprecated use setAdminSession */
export function setAdminToken(token: string): void {
  // Fallback: derive expiry as 24h from now if not provided
  setAdminSession(token, Date.now() + 24 * 60 * 60 * 1000);
}

export function clearAdminToken(): void {
  localStorage.removeItem(SESSION_KEY);
}

// ── Core fetch wrapper ────────────────────────────────────────────────────────

export class SessionExpiredError extends Error {
  constructor() { super("Session expired"); this.name = "SessionExpiredError"; }
}

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  // Client-side expiry guard — catch stale sessions before hitting the server
  if (path !== "/auth/login" && isSessionExpired()) {
    clearAdminToken();
    throw new SessionExpiredError();
  }

  const token = getAdminToken();
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts.headers,
    },
  });

  // Server-side expiry / revocation
  if (res.status === 401) {
    const body = await res.json().catch(() => ({ expired: false })) as { expired?: boolean; error?: string };
    if (body.expired) {
      clearAdminToken();
      throw new SessionExpiredError();
    }
    throw new Error(body.error ?? "Unauthorised");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ── Auth ──────────────────────────────────────────────────────────────────────
export const adminLogin = (secretKey: string) =>
  request<{ token: string; expiresAt: number }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ secretKey }),
  });

export const adminRefreshSession = () =>
  request<{ token: string; expiresAt: number }>("/auth/refresh", { method: "POST" });

export const adminLogout = () =>
  request<void>("/auth/logout", { method: "POST" });

export const adminMe = () =>
  request<{ role: string; authenticated: boolean; expiresAt?: number; nearExpiry?: boolean }>("/auth/me");

// ── Stats ─────────────────────────────────────────────────────────────────────
export interface AdminStats {
  totalUsers: number;
  totalSubscriptions: number;
  proUsers: number;
  freeUsers: number;
  billingEvents: number;
  bankConnections: number;
}
export const getAdminStats = () => request<AdminStats>("/stats");

// ── Health ────────────────────────────────────────────────────────────────────
export interface AdminHealth {
  api: { status: string; uptime: number };
  db: { status: string; latencyMs: number };
  env: string;
  timestamp: string;
}
export const getAdminHealth = () => request<AdminHealth>("/health");

// ── Users ─────────────────────────────────────────────────────────────────────
export interface AdminUser {
  id: number;
  email: string;
  name: string;
  subscriptionStatus: string;
  subscriptionPlan: string | null;
  billingProvider: string | null;
  stripeCustomerId: string | null;
  googleId: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface AdminUserDetail extends AdminUser {
  stripeSubscriptionId: string | null;
  paymentReference: string | null;
  gmailLastSyncAt: string | null;
  subscriptionCount: number;
  notificationCount: number;
}
export interface UsersResponse {
  users: AdminUser[];
  total: number;
  limit: number;
  offset: number;
}
export const getAdminUsers = (params?: { limit?: number; offset?: number; search?: string }) => {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.offset) qs.set("offset", String(params.offset));
  if (params?.search) qs.set("search", params.search);
  return request<UsersResponse>(`/users?${qs}`);
};
export const getAdminUser = (id: number) => request<AdminUserDetail>(`/users/${id}`);

// ── Billing ───────────────────────────────────────────────────────────────────
export interface BillingProvider {
  name: string; label: string; configured: boolean; active: boolean; keys: Record<string, string>;
}
export interface BillingConfig {
  providers: BillingProvider[];
  activeProvider: string | null;
}
export const getAdminBilling = () => request<BillingConfig>("/billing");

// ── Integrations ──────────────────────────────────────────────────────────────
export interface IntegrationInfo { label: string; configured: boolean; keys: Record<string, string>; }
export type IntegrationsConfig = Record<string, IntegrationInfo>;
export const getAdminIntegrations = () => request<IntegrationsConfig>("/integrations");

// ── Env ───────────────────────────────────────────────────────────────────────
export interface EnvVar { key: string; value: string; set: boolean; }
export const getAdminEnv = () => request<{ vars: EnvVar[] }>("/env");

// ── Feature flags ─────────────────────────────────────────────────────────────
export interface FeatureFlag { key: string; enabled: boolean; description: string; }
export const getAdminFlags = () => request<{ flags: FeatureFlag[] }>("/flags");
export const updateAdminFlag = (key: string, enabled: boolean) =>
  request<FeatureFlag>(`/flags/${key}`, { method: "PUT", body: JSON.stringify({ enabled }) });

// ── Audit logs ────────────────────────────────────────────────────────────────
export interface AuditLog {
  id: number;
  action: string;
  actor: string;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}
export const getAdminAuditLogs = (limit = 50) =>
  request<{ logs: AuditLog[] }>(`/audit-logs?limit=${limit}`);

// ── Request logs ──────────────────────────────────────────────────────────────
export interface LogEntry {
  ts: string; level: string; method?: string; url?: string;
  status?: number; responseTime?: number; msg?: string;
}
export const getAdminLogs = (limit = 100) =>
  request<{ logs: LogEntry[] }>(`/logs?limit=${limit}`);
