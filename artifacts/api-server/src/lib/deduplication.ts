/**
 * Subscription Deduplication + Confidence Scoring Engine
 *
 * Prevents duplicate subscriptions from bank + Gmail detection.
 * Uses fuzzy merchant matching, amount similarity, and billing interval
 * compatibility to find matches and merge them instead of creating duplicates.
 */

import { db, subscriptionsTable, subscriptionAuditLogsTable } from "@workspace/db";
import { eq, and, ne } from "drizzle-orm";
import type { Subscription } from "@workspace/db";

// ── Confidence score constants ────────────────────────────────────────────────

export const CONFIDENCE = {
  BANK_RECURRING: 0.9,
  EMAIL_RECEIPT: 0.6,
  EMAIL_TRIAL: 0.4,
  MULTI_SOURCE_BOOST: 0.1,
  MULTI_DETECTION_BOOST: 0.05,
  MAX: 1.0,
} as const;

// ── Fuzzy merchant name matching ──────────────────────────────────────────────

/**
 * Normalizes a merchant name for comparison:
 * - lowercase, strip punctuation, collapse spaces
 * - remove common noise words: "ltd", "inc", "com", ".co.uk", etc.
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\.(com|co\.uk|io|net|org|app|tv)$/gi, "")
    .replace(/\b(ltd|limited|inc|llc|plc|gmbh|bv|sa|ag|srl)\b/gi, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Tokenize a normalized name into a set of meaningful words (length >= 2).
 */
function tokenize(name: string): Set<string> {
  return new Set(
    normalizeName(name)
      .split(" ")
      .filter((t) => t.length >= 2),
  );
}

/**
 * Jaccard similarity between two token sets: |A ∩ B| / |A ∪ B|.
 * Returns 0–1. Threshold ≥ 0.4 is considered a match.
 */
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  const intersection = [...a].filter((x) => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Checks if one name is a prefix/substring of the other after normalization
 * (e.g. "Netflix" vs "Netflix Premium" → true).
 */
function isSubstringMatch(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  return na.includes(nb) || nb.includes(na);
}

/**
 * Returns true if two merchant names are similar enough to be the same service.
 */
export function merchantNamesMatch(a: string, b: string): boolean {
  if (normalizeName(a) === normalizeName(b)) return true;
  if (isSubstringMatch(a, b)) return true;
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);
  return jaccardSimilarity(tokensA, tokensB) >= 0.4;
}

/**
 * Returns the type of name match for audit trail purposes.
 */
function getNameMatchType(a: string, b: string): string {
  if (normalizeName(a) === normalizeName(b)) return "exact_name";
  if (isSubstringMatch(a, b)) return "substring_match";
  return "token_similarity";
}

// ── Amount similarity ─────────────────────────────────────────────────────────

/**
 * Returns true if two amounts are within 15% of each other, OR if one is 0
 * (email detected but amount unknown).
 */
export function amountsCompatible(a: number, b: number): boolean {
  if (a === 0 || b === 0) return true;
  const diff = Math.abs(a - b);
  const avg = (a + b) / 2;
  return diff / avg <= 0.15;
}

// ── Billing cycle compatibility ───────────────────────────────────────────────

const CYCLE_GROUPS: Record<string, string> = {
  monthly: "monthly",
  month: "monthly",
  yearly: "yearly",
  annual: "yearly",
  annually: "yearly",
  weekly: "weekly",
  week: "weekly",
};

/**
 * Returns true if two billing cycles are compatible (both unknown, or same group).
 */
export function billingCyclesCompatible(a: string, b: string): boolean {
  const ga = CYCLE_GROUPS[a.toLowerCase()] ?? a.toLowerCase();
  const gb = CYCLE_GROUPS[b.toLowerCase()] ?? b.toLowerCase();
  return ga === gb;
}

// ── Core deduplication logic ──────────────────────────────────────────────────

export interface DeduplicationInput {
  userId: number;
  merchantName: string;
  amount: number | null;
  billingCycle: string;
  source: "bank" | "email" | "manual";
  emailMetadata?: Record<string, unknown> | null;
  bankConnectionId?: number | null;
  category?: string | null;
  confidenceScore: number;
  nextRenewalDate?: Date | null;
  /** Optional: extra context for audit log (e.g. transactionCount from bank detection) */
  auditContext?: Record<string, unknown>;
}

export interface DeduplicationResult {
  action: "created" | "merged";
  subscriptionId: number;
  mergedFrom?: string;
}

/**
 * Upsert a detected subscription with full deduplication:
 * - Find existing subscriptions by fuzzy name + amount + cycle
 * - If match: merge sources, boost confidence, attach metadata
 * - If no match: insert new subscription
 * Writes an audit log entry for every create or merge event.
 */
export async function upsertWithDeduplication(
  input: DeduplicationInput,
): Promise<DeduplicationResult> {
  // Load active/paused subscriptions for this user to check against.
  // Exclude cancelled: if a user resubscribes after cancelling, they should
  // get a fresh active record, not a merge into the old cancelled one.
  const existing = await db
    .select()
    .from(subscriptionsTable)
    .where(
      and(
        eq(subscriptionsTable.userId, input.userId),
        ne(subscriptionsTable.status, "cancelled"),
      ),
    );

  const inputAmount = input.amount ?? 0;
  const match = existing.find((sub) => {
    const nameMatch = merchantNamesMatch(sub.merchantName, input.merchantName);
    if (!nameMatch) return false;
    const amtMatch = amountsCompatible(Number(sub.amount), inputAmount);
    const cycleMatch = billingCyclesCompatible(sub.billingCycle, input.billingCycle);
    return amtMatch && cycleMatch;
  });

  if (match) {
    // ── MERGE into existing record ──────────────────────────────────────────
    const existingSources: string[] = Array.isArray(match.sources)
      ? (match.sources as string[])
      : [match.source ?? "bank"];

    const newSources = Array.from(new Set([...existingSources, input.source]));
    const hasMultipleSources = newSources.length > 1;

    // Confidence breakdown for audit
    const baseConfidence = Math.max(match.confidenceScore, input.confidenceScore);
    const multiSourceBoost = hasMultipleSources && !existingSources.includes(input.source)
      ? CONFIDENCE.MULTI_SOURCE_BOOST
      : 0;
    const multiDetectionBoost = CONFIDENCE.MULTI_DETECTION_BOOST;

    let newConfidence = Math.min(
      CONFIDENCE.MAX,
      baseConfidence + multiSourceBoost + multiDetectionBoost,
    );

    // Derive the primary source (prefer bank over email)
    const primarySource = newSources.includes("bank") ? "bank" : newSources[0];

    const updatePayload: Partial<typeof subscriptionsTable.$inferInsert> = {
      sources: newSources,
      source: primarySource,
      confidenceScore: newConfidence,
      lastDetectedAt: new Date(),
    };

    // Attach email metadata if merging an email detection and not already set
    if (input.source === "email" && input.emailMetadata && !match.emailMetadata) {
      updatePayload.emailMetadata = input.emailMetadata;
    }

    // Update amount if email didn't have one (bank amount is more reliable)
    if (input.source === "bank" && inputAmount > 0) {
      updatePayload.amount = String(inputAmount.toFixed(2));
      updatePayload.billingCycle = input.billingCycle;
    }

    // Update nextRenewalDate if bank is providing it
    if (input.source === "bank" && input.nextRenewalDate) {
      updatePayload.nextRenewalDate = input.nextRenewalDate;
    }

    await db
      .update(subscriptionsTable)
      .set(updatePayload)
      .where(eq(subscriptionsTable.id, match.id));

    // Write audit log — fire without blocking the response
    const nameMatchType = getNameMatchType(match.merchantName, input.merchantName);
    writeAuditLog(match.id, "merged", input.source, {
      incomingMerchant: input.merchantName,
      incomingSource: input.source,
      incomingAmount: inputAmount,
      matchedTo: match.merchantName,
      nameMatchType,
      amountMatch: amountsCompatible(Number(match.amount), inputAmount),
      cycleMatch: billingCyclesCompatible(match.billingCycle, input.billingCycle),
      previousConfidence: match.confidenceScore,
      newConfidence,
      newSources,
      confidenceBreakdown: {
        base: baseConfidence,
        multiSourceBoost,
        multiDetectionBoost,
        final: newConfidence,
      },
      ...input.auditContext,
    });

    return {
      action: "merged",
      subscriptionId: match.id,
      mergedFrom: match.merchantName,
    };
  }

  // ── CREATE new subscription ───────────────────────────────────────────────
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());

  const [inserted] = await db
    .insert(subscriptionsTable)
    .values({
      userId: input.userId,
      merchantName: input.merchantName,
      amount: String((inputAmount || 0).toFixed(2)),
      currency: "GBP",
      billingCycle: input.billingCycle,
      nextRenewalDate: input.nextRenewalDate ?? nextMonth,
      category: input.category ?? null,
      status: "active",
      confidenceScore: input.confidenceScore,
      source: input.source,
      sources: [input.source],
      emailMetadata: input.emailMetadata ?? null,
      bankConnectionId: input.bankConnectionId ?? null,
      lastDetectedAt: now,
    })
    .returning({ id: subscriptionsTable.id });

  // Write audit log
  writeAuditLog(inserted.id, "detected", input.source, {
    merchantName: input.merchantName,
    amount: inputAmount,
    billingCycle: input.billingCycle,
    confidenceBreakdown: {
      base: input.confidenceScore,
      multiSourceBoost: 0,
      multiDetectionBoost: 0,
      final: input.confidenceScore,
    },
    matchedBy: input.source === "bank" ? "recurring_pattern" : "email_receipt",
    ...input.auditContext,
  });

  return { action: "created", subscriptionId: inserted.id };
}

// ── Audit log writer ──────────────────────────────────────────────────────────

/**
 * Fire-and-forget audit log write. Errors are swallowed to avoid blocking
 * the detection pipeline — audit failures should never surface to the user.
 */
function writeAuditLog(
  subscriptionId: number,
  eventType: string,
  source: string,
  metadata: Record<string, unknown>,
): void {
  db.insert(subscriptionAuditLogsTable)
    .values({ subscriptionId, eventType, source, metadata })
    .catch(() => {
      // Intentionally silent — audit log failures must not affect detection
    });
}

// ── Confidence scoring helpers ────────────────────────────────────────────────

/**
 * Returns initial confidence score for a given detection source + context.
 */
export function initialConfidence(
  source: "bank" | "email",
  context: "recurring" | "receipt" | "trial" = "receipt",
): number {
  if (source === "bank") return CONFIDENCE.BANK_RECURRING;
  if (context === "trial") return CONFIDENCE.EMAIL_TRIAL;
  return CONFIDENCE.EMAIL_RECEIPT;
}

/**
 * Detects whether an email subject/snippet indicates a trial (lower confidence).
 */
export function isTrialEmail(subject: string, snippet: string): boolean {
  const text = `${subject} ${snippet}`.toLowerCase();
  return /free trial|trial ending|trial period|trial expires|your trial/.test(text);
}

/**
 * Builds a human-readable confidence breakdown for a subscription.
 * Used by the audit/explanation layer on the frontend.
 */
export function buildConfidenceBreakdown(
  confidenceScore: number,
  sources: string[],
): {
  base: number;
  multiSourceBoost: number;
  final: number;
  factors: string[];
} {
  const hasBank = sources.includes("bank");
  const hasEmail = sources.includes("email");
  const base = hasBank ? CONFIDENCE.BANK_RECURRING : CONFIDENCE.EMAIL_RECEIPT;
  const multiSourceBoost = hasBank && hasEmail ? CONFIDENCE.MULTI_SOURCE_BOOST : 0;
  const factors: string[] = [];

  if (hasBank) factors.push(`Bank recurring pattern (base: ${(base * 100).toFixed(0)}%)`);
  if (hasEmail && !hasBank) factors.push(`Email receipt detection (base: ${(base * 100).toFixed(0)}%)`);
  if (multiSourceBoost > 0) factors.push(`Multi-source confirmation boost (+${(multiSourceBoost * 100).toFixed(0)}%)`);
  if (confidenceScore > base + multiSourceBoost) {
    const detBoost = confidenceScore - base - multiSourceBoost;
    if (detBoost > 0) factors.push(`Multiple detections boost (+${(detBoost * 100).toFixed(0)}%)`);
  }

  return { base, multiSourceBoost, final: confidenceScore, factors };
}
