/**
 * AES-256-GCM token encryption/decryption.
 *
 * Used to protect TrueLayer access and refresh tokens at rest.
 * Tokens are never stored in plaintext or exposed to the frontend.
 *
 * Encrypted format (base64-encoded): IV (12 bytes) + AuthTag (16 bytes) + Ciphertext
 *
 * Requires:
 *   ENCRYPTION_KEY — 64-character hex string representing 32 bytes
 *   Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { logger } from "./logger";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;    // 96-bit IV (recommended for GCM)
const TAG_LENGTH = 16;   // 128-bit authentication tag

function getEncryptionKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex) {
    // Fallback key for development only — in production, always set ENCRYPTION_KEY
    if (process.env.NODE_ENV === "production") {
      throw new Error("ENCRYPTION_KEY must be set in production");
    }
    logger.warn("ENCRYPTION_KEY not set — using insecure development fallback. Set this in production.");
    return Buffer.alloc(32, "dev-fallback-key-do-not-use-in-prod");
  }
  const buf = Buffer.from(hex, "hex");
  if (buf.length !== 32) {
    throw new Error("ENCRYPTION_KEY must be exactly 32 bytes (64 hex characters)");
  }
  return buf;
}

/**
 * Encrypts a plaintext string with AES-256-GCM.
 * Returns a base64-encoded string safe for database storage.
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  // Pack: iv (12) + tag (16) + ciphertext
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

/**
 * Decrypts a base64-encoded AES-256-GCM ciphertext.
 * Throws if the data has been tampered with.
 */
export function decrypt(encoded: string): string {
  const key = getEncryptionKey();
  const buf = Buffer.from(encoded, "base64");
  if (buf.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error("Encrypted token is too short — data may be corrupt");
  }
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(ciphertext).toString("utf8") + decipher.final("utf8");
}
