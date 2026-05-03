import { db, transactionsTable, subscriptionsTable, bankConnectionsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { logger } from "./logger";
import { upsertWithDeduplication, initialConfidence } from "./deduplication";
import { createNotification, hasRecentNewSubNotification } from "./notificationService";

interface TransactionGroup {
  merchantName: string;
  amounts: number[];
  dates: Date[];
  bankConnectionId: number;
}

const GBP = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

export async function detectSubscriptions(userId: number): Promise<{ detected: number; updated: number }> {
  // ── Step 1: Resolve this user's bank connections ──────────────────────────
  const userConnections = await db
    .select({ id: bankConnectionsTable.id })
    .from(bankConnectionsTable)
    .where(eq(bankConnectionsTable.userId, userId));

  if (userConnections.length === 0) {
    return { detected: 0, updated: 0 };
  }

  const connectionIds = userConnections.map((c) => c.id);

  // ── Step 2: Fetch only this user's transactions ───────────────────────────
  const transactions = await db
    .select()
    .from(transactionsTable)
    .where(inArray(transactionsTable.bankConnectionId, connectionIds));

  // ── Step 3: Group by merchant name to identify recurring patterns ─────────
  const groups = new Map<string, TransactionGroup>();

  for (const tx of transactions) {
    const key = tx.merchantName.toLowerCase().trim();
    if (!groups.has(key)) {
      groups.set(key, {
        merchantName: tx.merchantName,
        amounts: [],
        dates: [],
        bankConnectionId: tx.bankConnectionId,
      });
    }
    const group = groups.get(key)!;
    group.amounts.push(Number(tx.amount));
    group.dates.push(new Date(tx.transactionDate));
  }

  let detected = 0;
  let updated = 0;

  for (const [, group] of groups) {
    if (group.amounts.length < 2) continue;

    // ── Consistent amount check (within 10% tolerance) ──────────────────────
    const avgAmount = group.amounts.reduce((a, b) => a + b, 0) / group.amounts.length;
    const tolerance = avgAmount * 0.1;
    const consistent = group.amounts.every((a) => Math.abs(a - avgAmount) <= tolerance);
    if (!consistent) continue;

    // ── Recurring interval check ─────────────────────────────────────────────
    const sortedDates = [...group.dates].sort((a, b) => a.getTime() - b.getTime());
    const intervals: number[] = [];
    for (let i = 1; i < sortedDates.length; i++) {
      const days = (sortedDates[i].getTime() - sortedDates[i - 1].getTime()) / (1000 * 60 * 60 * 24);
      intervals.push(days);
    }

    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    let billingCycle: string | null = null;

    if (avgInterval >= 25 && avgInterval <= 35) billingCycle = "monthly";
    else if (avgInterval >= 350 && avgInterval <= 380) billingCycle = "yearly";
    else if (avgInterval >= 6 && avgInterval <= 8) billingCycle = "weekly";

    if (!billingCycle) continue;

    // ── Calculate next renewal date ──────────────────────────────────────────
    const lastDate = sortedDates[sortedDates.length - 1];
    const nextRenewalDate = new Date(lastDate);
    if (billingCycle === "monthly") nextRenewalDate.setMonth(nextRenewalDate.getMonth() + 1);
    else if (billingCycle === "yearly") nextRenewalDate.setFullYear(nextRenewalDate.getFullYear() + 1);
    else if (billingCycle === "weekly") nextRenewalDate.setDate(nextRenewalDate.getDate() + 7);

    const confidence = initialConfidence("bank", "recurring");

    const result = await upsertWithDeduplication({
      userId,
      merchantName: group.merchantName,
      amount: avgAmount,
      billingCycle,
      source: "bank",
      bankConnectionId: group.bankConnectionId,
      confidenceScore: confidence,
      nextRenewalDate,
      auditContext: { transactionCount: group.amounts.length },
    });

    if (result.action === "created") {
      detected++;

      // ── Notify for high-confidence new subscriptions (≥ 0.7) ─────────────
      // Fire-and-forget — never blocks detection pipeline
      if (confidence >= 0.7) {
        const merchantName = group.merchantName;
        const subId = result.subscriptionId;
        hasRecentNewSubNotification(userId, merchantName)
          .then((alreadyNotified) => {
            if (alreadyNotified) return;
            const amountStr = GBP.format(avgAmount);
            return createNotification(
              userId,
              "new_subscription_detected",
              `New subscription detected: ${merchantName}`,
              `We found a new subscription: ${merchantName} (${amountStr}/${billingCycle}) — detected from your bank transactions.`,
              {
                subscriptionId: subId,
                metadata: {
                  subscriptionId: subId,
                  merchantName,
                  amount: avgAmount,
                  billingCycle,
                  source: "bank",
                  confidenceScore: confidence,
                },
              },
            );
          })
          .catch((err) => logger.error({ err, merchantName }, "new_subscription_detected notification failed"));
      }
    } else {
      updated++;
    }
  }

  logger.info({ userId, detected, updated, transactionsScanned: transactions.length }, "Subscription detection complete");
  return { detected, updated };
}

// ── UK Merchant Seed Data ─────────────────────────────────────────────────────

const UK_MERCHANTS: Array<{
  name: string;
  amount: number;
  cycle: string;
  category: string;
}> = [
  { name: "Netflix",            amount: 17.99, cycle: "monthly", category: "Entertainment" },
  { name: "Spotify",            amount: 11.99, cycle: "monthly", category: "Entertainment" },
  { name: "Amazon Prime",       amount: 8.99,  cycle: "monthly", category: "Shopping" },
  { name: "Disney+",            amount: 4.99,  cycle: "monthly", category: "Entertainment" },
  { name: "Apple iCloud",       amount: 0.99,  cycle: "monthly", category: "Technology" },
  { name: "Microsoft 365",      amount: 7.99,  cycle: "monthly", category: "Technology" },
  { name: "Sky TV",             amount: 26.00, cycle: "monthly", category: "Entertainment" },
  { name: "Gym Membership",     amount: 35.00, cycle: "monthly", category: "Health & Fitness" },
  { name: "Adobe Creative Cloud", amount: 54.99, cycle: "monthly", category: "Technology" },
  { name: "Deliveroo Plus",     amount: 3.99,  cycle: "monthly", category: "Food & Drink" },
];

/**
 * Seeds demo subscriptions from UK merchants when a bank account is connected
 * for the first time and detection found nothing.
 * Does NOT fire new_subscription_detected notifications — seeded data is not
 * a genuine new detection event.
 */
export async function seedSubscriptionsFromBank(
  userId: number,
  bankConnectionId: number,
  count = 5,
): Promise<number> {
  const existing = await db
    .select({ id: subscriptionsTable.id })
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.userId, userId));

  if (existing.length > 0) return 0;

  let seeded = 0;
  const merchants = UK_MERCHANTS.slice(0, count);

  for (const m of merchants) {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());

    await upsertWithDeduplication({
      userId,
      merchantName: m.name,
      amount: m.amount,
      billingCycle: m.cycle,
      source: "bank",
      bankConnectionId,
      category: m.category,
      confidenceScore: initialConfidence("bank", "recurring"),
      nextRenewalDate: nextMonth,
    });
    seeded++;
  }

  return seeded;
}
