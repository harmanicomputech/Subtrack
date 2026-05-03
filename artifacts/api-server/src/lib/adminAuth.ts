import crypto from "crypto";

// ── Admin session tokens ──────────────────────────────────────────────────────

const adminTokens = new Set<string>();

export function generateAdminToken(): string {
  const token = crypto.randomBytes(32).toString("hex");
  adminTokens.add(token);
  return token;
}

export function isValidAdminToken(token: string): boolean {
  return adminTokens.has(token);
}

export function revokeAdminToken(token: string): void {
  adminTokens.delete(token);
}

export function verifyAdminSecret(secret: string): boolean {
  const key = process.env["ADMIN_SECRET_KEY"];
  if (!key) return false;
  // Constant-time comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(key));
  } catch {
    return false;
  }
}

// ── Log ring buffer ───────────────────────────────────────────────────────────

export interface LogEntry {
  ts: string;
  level: string;
  method?: string;
  url?: string;
  status?: number;
  responseTime?: number;
  msg?: string;
}

const LOG_BUFFER_SIZE = 200;
const logBuffer: LogEntry[] = [];

export function pushLogEntry(entry: LogEntry): void {
  if (logBuffer.length >= LOG_BUFFER_SIZE) logBuffer.shift();
  logBuffer.push(entry);
}

export function getLogEntries(limit = 100): LogEntry[] {
  return logBuffer.slice(-limit).reverse();
}
