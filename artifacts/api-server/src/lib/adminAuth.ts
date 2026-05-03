import crypto from "crypto";

// ── HMAC-signed token helpers ─────────────────────────────────────────────────

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const REFRESH_THRESHOLD_MS = 5 * 60 * 1000;  // 5 minutes

interface TokenPayload {
  iat: number;
  exp: number;
  jti: string;
}

function getSecretKey(): string {
  const key = process.env["ADMIN_SECRET_KEY"];
  if (!key) throw new Error("ADMIN_SECRET_KEY is not configured");
  return key;
}

function signPayload(b64Payload: string): string {
  return crypto.createHmac("sha256", getSecretKey()).update(b64Payload).digest("hex");
}

function encodePayload(payload: TokenPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function decodePayload(b64: string): TokenPayload | null {
  try {
    return JSON.parse(Buffer.from(b64, "base64url").toString("utf8")) as TokenPayload;
  } catch {
    return null;
  }
}

export function generateAdminToken(): string {
  const now = Date.now();
  const payload: TokenPayload = {
    iat: now,
    exp: now + SESSION_TTL_MS,
    jti: crypto.randomBytes(16).toString("hex"),
  };
  const b64 = encodePayload(payload);
  const sig = signPayload(b64);
  return `${b64}.${sig}`;
}

export interface TokenValidation {
  valid: boolean;
  expired?: boolean;
  nearExpiry?: boolean;
  payload?: TokenPayload;
  error?: string;
}

export function validateAdminToken(token: string): TokenValidation {
  const parts = token.split(".");
  if (parts.length !== 2) return { valid: false, error: "malformed token" };
  const [b64, sig] = parts as [string, string];

  // Constant-time signature check
  const expectedSig = signPayload(b64);
  let sigValid = false;
  try {
    sigValid = crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expectedSig, "hex"));
  } catch {
    return { valid: false, error: "invalid signature encoding" };
  }
  if (!sigValid) return { valid: false, error: "signature mismatch" };

  const payload = decodePayload(b64);
  if (!payload) return { valid: false, error: "malformed payload" };

  const now = Date.now();
  if (now > payload.exp) return { valid: false, expired: true, error: "token expired" };

  const nearExpiry = payload.exp - now < REFRESH_THRESHOLD_MS;
  return { valid: true, nearExpiry, payload };
}

// Legacy shim used by middleware
export function isValidAdminToken(token: string): boolean {
  try {
    return validateAdminToken(token).valid;
  } catch {
    return false;
  }
}

// Revoked tokens (explicit logouts before natural expiry)
const revokedJtis = new Set<string>();

export function revokeAdminToken(token: string): void {
  const parts = token.split(".");
  if (parts.length !== 2) return;
  const payload = decodePayload(parts[0]!);
  if (payload?.jti) revokedJtis.add(payload.jti);
}

export function isTokenRevoked(token: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const payload = decodePayload(parts[0]!);
  return !!(payload?.jti && revokedJtis.has(payload.jti));
}

// ── Admin secret verification ─────────────────────────────────────────────────

export function verifyAdminSecret(secret: string): boolean {
  const key = process.env["ADMIN_SECRET_KEY"];
  if (!key) return false;
  try {
    // Pad to same length so timingSafeEqual doesn't error on mismatch
    const a = Buffer.from(secret.padEnd(key.length, "\0"));
    const b = Buffer.from(key.padEnd(secret.length, "\0"));
    // Both must be same length — compare the shorter against a fixed-length hash
    const ha = crypto.createHmac("sha256", "cmp").update(secret).digest();
    const hb = crypto.createHmac("sha256", "cmp").update(key).digest();
    return crypto.timingSafeEqual(ha, hb);
  } catch {
    return false;
  }
}

// ── Brute-force protection ────────────────────────────────────────────────────

interface BruteRecord {
  count: number;
  lockUntil: number;
}
const bruteForceMap = new Map<string, BruteRecord>();
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 10 * 60 * 1000;

export function checkBruteForce(ip: string): { blocked: boolean; retryAfterSec?: number } {
  const rec = bruteForceMap.get(ip);
  if (!rec) return { blocked: false };
  if (rec.lockUntil > Date.now()) {
    return { blocked: true, retryAfterSec: Math.ceil((rec.lockUntil - Date.now()) / 1000) };
  }
  return { blocked: false };
}

export function recordFailedAttempt(ip: string): void {
  const now = Date.now();
  const rec = bruteForceMap.get(ip) ?? { count: 0, lockUntil: 0 };
  // Reset count if previous lockout has expired
  if (rec.lockUntil > 0 && rec.lockUntil < now) {
    bruteForceMap.set(ip, { count: 1, lockUntil: 0 });
    return;
  }
  rec.count += 1;
  if (rec.count >= MAX_ATTEMPTS) {
    rec.lockUntil = now + LOCKOUT_MS;
  }
  bruteForceMap.set(ip, rec);
}

export function clearFailedAttempts(ip: string): void {
  bruteForceMap.delete(ip);
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
