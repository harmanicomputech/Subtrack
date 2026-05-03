/**
 * Subscription Insights Engine
 *
 * Evaluates each subscription's likely usage state using heuristic rules:
 * 1. Email-only detections with no bank confirmation → trial / uncertain
 * 2. Low detection confidence → uncertain / needs review
 * 3. Subscription active for >60 days with no fresh signals → possibly unused
 * 4. Multi-source (bank + email) confirmation → confirmed active
 *
 * Results are written back to the subscriptions table as:
 *   usageStatus: "active" | "unused" | "trial" | "uncertain"
 *   unusedScore: 0–1 (higher = more likely unused)
 *
 * Deliberately conservative — phrases like "may be unused" in the UI.
 */

import { db, subscriptionsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

export type UsageStatus = "active" | "unused" | "trial" | "uncertain";

interface InsightResult {
  id: number;
  usageStatus: UsageStatus;
  unusedScore: number;
  reason: string;
}

const UNUSED_AGE_DAYS = 60;      // flag if active > 60 days with no fresh signals
const RECENT_SIGNAL_DAYS = 30;   // "fresh signal" = lastDetectedAt within last 30 days

function daysSince(date: Date | null | undefined): number {
  if (!date) return 9999;
  return (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
}

/**
 * Analyse a single subscription and return its usage insight.
 */
function analyseSubscription(sub: typeof subscriptionsTable.$inferSelect): InsightResult {
  const sources: string[] = Array.isArray(sub.sources)
    ? (sub.sources as string[])
    : [sub.source ?? "bank"];

  const hasBank = sources.includes("bank");
  const hasEmail = sources.includes("email");
  const isMultiSource = hasBank && hasEmail;

  const confidence = sub.confidenceScore;
  const ageInDays = daysSince(sub.createdAt);
  const sinceLastDetect = daysSince(sub.lastDetectedAt ?? sub.createdAt);

  // ── Rule 1: Multi-source = actively confirmed ────────────────────────────
  if (isMultiSource && confidence >= 0.8) {
    return {
      id: sub.id,
      usageStatus: "active",
      unusedScore: 0.05,
      reason: "Confirmed by bank transactions and email receipts.",
    };
  }

  // ── Rule 2: Email-only + very low confidence = likely trial ───────────────
  if (!hasBank && hasEmail && confidence <= 0.45) {
    return {
      id: sub.id,
      usageStatus: "trial",
      unusedScore: 0.75,
      reason: "Detected from email only — may be a trial or forgotten signup with no bank charge yet.",
    };
  }

  // ── Rule 3: Email-only + medium confidence = uncertain ────────────────────
  if (!hasBank && hasEmail) {
    return {
      id: sub.id,
      usageStatus: "uncertain",
      unusedScore: 0.5,
      reason: "Detected from email receipts but not yet confirmed by a bank transaction.",
    };
  }

  // ── Rule 4: Low confidence (any source) = needs review ────────────────────
  if (confidence < 0.6) {
    return {
      id: sub.id,
      usageStatus: "uncertain",
      unusedScore: 0.4,
      reason: "Detection confidence is low — we're not fully sure this is an active subscription.",
    };
  }

  // ── Rule 5: Old subscription, no recent signals ───────────────────────────
  if (
    ageInDays > UNUSED_AGE_DAYS &&
    sinceLastDetect > RECENT_SIGNAL_DAYS &&
    !isMultiSource
  ) {
    // Score scales with age: 60 days → 0.6, 120 days → 0.75 (capped at 0.85)
    const ageScore = Math.min(0.85, 0.6 + (ageInDays - UNUSED_AGE_DAYS) / 400);
    return {
      id: sub.id,
      usageStatus: "unused",
      unusedScore: Math.round(ageScore * 100) / 100,
      reason: `No activity signal detected in the last ${Math.round(sinceLastDetect)} days. This subscription may no longer be in use.`,
    };
  }

  // ── Rule 6: High-value subscription ─────────────────────────────────────
  const monthlyEquivalent =
    sub.billingCycle === "yearly"
      ? Number(sub.amount) / 12
      : sub.billingCycle === "weekly"
        ? Number(sub.amount) * 4.33
        : Number(sub.amount);

  if (monthlyEquivalent >= 30) {
    const yearlyEquivalent = monthlyEquivalent * 12;
    return {
      id: sub.id,
      usageStatus: "active",
      unusedScore: 0.1,
      reason: `High-value subscription at £${Number(sub.amount).toFixed(2)}/${sub.billingCycle} (roughly £${Math.round(yearlyEquivalent)} per year). Worth confirming you're still using it.`,
    };
  }

  // ── Rule 7: Bank source, decent confidence, relatively recent ─────────────
  return {
    id: sub.id,
    usageStatus: "active",
    unusedScore: 0.1,
    reason: "Detected from recurring bank payments — appears to be an active subscription.",
  };
}

/**
 * Run insights analysis for all active/paused subscriptions belonging to a user.
 * Writes usageStatus + unusedScore back to the DB.
 * Returns a summary of what was found.
 */
export async function analyseUserSubscriptions(userId: number): Promise<{
  total: number;
  unused: number;
  trial: number;
  uncertain: number;
  potentialMonthlySaving: number;
}> {
  const subscriptions = await db
    .select()
    .from(subscriptionsTable)
    .where(
      and(
        eq(subscriptionsTable.userId, userId),
        // Only analyse non-cancelled (no point flagging already-cancelled ones)
      ),
    );

  const active = subscriptions.filter(s => s.status !== "cancelled");

  let unused = 0;
  let trial = 0;
  let uncertain = 0;
  let potentialMonthlySaving = 0;

  // Run heuristics and batch-write results
  await Promise.all(
    active.map(async (sub) => {
      const result = analyseSubscription(sub);

      await db
        .update(subscriptionsTable)
        .set({
          usageStatus: result.usageStatus,
          unusedScore: result.unusedScore,
        })
        .where(eq(subscriptionsTable.id, sub.id));

      if (result.usageStatus === "unused") {
        unused++;
        // Only count monthly-equivalent amount toward savings
        const monthlyAmount = sub.billingCycle === "yearly"
          ? Number(sub.amount) / 12
          : Number(sub.amount);
        potentialMonthlySaving += monthlyAmount;
      } else if (result.usageStatus === "trial") {
        trial++;
      } else if (result.usageStatus === "uncertain") {
        uncertain++;
      }
    }),
  );

  return {
    total: active.length,
    unused,
    trial,
    uncertain,
    potentialMonthlySaving: Math.round(potentialMonthlySaving * 100) / 100,
  };
}

/**
 * Get the human-readable reason why a subscription is flagged.
 * Used by the subscription detail page.
 */
export function getInsightReason(sub: typeof subscriptionsTable.$inferSelect): string {
  return analyseSubscription(sub).reason;
}
