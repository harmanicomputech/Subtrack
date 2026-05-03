import crypto from "crypto";

// ── Password ──────────────────────────────────────────────────────────────────

export function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "subtrack_salt").digest("hex");
}

export function verifyPassword(password: string, hash: string): boolean {
  return hashPassword(password) === hash;
}

// ── Session tokens ────────────────────────────────────────────────────────────

export function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

const tokens = new Map<string, number>();

export function storeToken(token: string, userId: number): void {
  tokens.set(token, userId);
}

export function getUserIdFromToken(token: string): number | null {
  return tokens.get(token) ?? null;
}

export function revokeToken(token: string): void {
  tokens.delete(token);
}

// ── Password reset tokens (hashed, 1-hour expiry) ─────────────────────────────

interface ResetEntry { userId: number; expiresAt: number; }
const resetTokens = new Map<string, ResetEntry>(); // key = sha256(rawToken)

export function createResetToken(userId: number): string {
  const raw = crypto.randomBytes(32).toString("hex");
  const hashed = crypto.createHash("sha256").update(raw).digest("hex");
  // Clean up any previous token for this user
  for (const [k, v] of resetTokens) {
    if (v.userId === userId) resetTokens.delete(k);
  }
  resetTokens.set(hashed, { userId, expiresAt: Date.now() + 60 * 60 * 1000 });
  return raw;
}

export function consumeResetToken(rawToken: string): number | null {
  const hashed = crypto.createHash("sha256").update(rawToken).digest("hex");
  const entry = resetTokens.get(hashed);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    resetTokens.delete(hashed);
    return null;
  }
  resetTokens.delete(hashed);
  return entry.userId;
}
