const BASE = "/api/admin";
const TOKEN_KEY = "recuris_admin_token";

export function getAdminToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAdminToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAdminToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = getAdminToken();
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ── Auth ──────────────────────────────────────────────────────────────────────
export const adminLogin = (secretKey: string) =>
  request<{ token: string }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ secretKey }),
  });

export const adminLogout = () =>
  request<void>("/auth/logout", { method: "POST" });

export const adminMe = () =>
  request<{ role: string; authenticated: boolean }>("/auth/me");

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
export const getAdminUser = (id: number) =>
  request<AdminUserDetail>(`/users/${id}`);

// ── Billing ───────────────────────────────────────────────────────────────────
export interface BillingProvider {
  name: string;
  label: string;
  configured: boolean;
  active: boolean;
  keys: Record<string, string>;
}
export interface BillingConfig {
  providers: BillingProvider[];
  activeProvider: string | null;
}
export const getAdminBilling = () => request<BillingConfig>("/billing");

// ── Integrations ──────────────────────────────────────────────────────────────
export interface IntegrationInfo {
  label: string;
  configured: boolean;
  keys: Record<string, string>;
}
export type IntegrationsConfig = Record<string, IntegrationInfo>;
export const getAdminIntegrations = () => request<IntegrationsConfig>("/integrations");

// ── Env ───────────────────────────────────────────────────────────────────────
export interface EnvVar {
  key: string;
  value: string;
  set: boolean;
}
export const getAdminEnv = () => request<{ vars: EnvVar[] }>("/env");

// ── Feature flags ─────────────────────────────────────────────────────────────
export interface FeatureFlag {
  key: string;
  enabled: boolean;
  description: string;
}
export const getAdminFlags = () => request<{ flags: FeatureFlag[] }>("/flags");
export const updateAdminFlag = (key: string, enabled: boolean) =>
  request<FeatureFlag>(`/flags/${key}`, {
    method: "PUT",
    body: JSON.stringify({ enabled }),
  });

// ── Logs ──────────────────────────────────────────────────────────────────────
export interface LogEntry {
  ts: string;
  level: string;
  method?: string;
  url?: string;
  status?: number;
  responseTime?: number;
  msg?: string;
}
export const getAdminLogs = (limit = 100) =>
  request<{ logs: LogEntry[] }>(`/logs?limit=${limit}`);
