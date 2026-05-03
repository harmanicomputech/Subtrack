import { and, eq, lte, gte, isNotNull } from "drizzle-orm";
import { db, subscriptionsTable, notificationsTable } from "@workspace/db";
import { logger } from "./logger";
import { createNotification } from "./notificationService";

const INTERVAL_MS = 8 * 60 * 60 * 1000; // 8 hours

async function checkUpcomingRenewals(): Promise<void> {
  const now = new Date();
  const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  const upcomingSubs = await db
    .select()
    .from(subscriptionsTable)
    .where(
      and(
        eq(subscriptionsTable.status, "active"),
        isNotNull(subscriptionsTable.nextRenewalDate),
        gte(subscriptionsTable.nextRenewalDate, now),
        lte(subscriptionsTable.nextRenewalDate, threeDaysFromNow),
      ),
    );

  let created = 0;

  for (const sub of upcomingSubs) {
    try {
      // Deduplication: skip if a renewal_alert for this subscription was sent in last 24h
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const [existing] = await db
        .select({ id: notificationsTable.id })
        .from(notificationsTable)
        .where(
          and(
            eq(notificationsTable.userId, sub.userId),
            eq(notificationsTable.type, "renewal_alert"),
            eq(notificationsTable.subscriptionId, sub.id),
            gte(notificationsTable.createdAt, oneDayAgo),
          ),
        )
        .limit(1);

      if (existing) continue;

      const renewalDate = sub.nextRenewalDate!;
      const msUntil = renewalDate.getTime() - now.getTime();
      const daysUntil = Math.ceil(msUntil / (1000 * 60 * 60 * 24));
      const daysText =
        daysUntil === 0 ? "today" : daysUntil === 1 ? "tomorrow" : `in ${daysUntil} days`;

      const amount = new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: sub.currency ?? "GBP",
      }).format(Number(sub.amount));

      await createNotification(
        sub.userId,
        "renewal_alert",
        `${sub.merchantName} renews ${daysText}`,
        `Your ${sub.merchantName} subscription (${amount}/${sub.billingCycle}) is due ${daysText}. Check your subscriptions to review or cancel.`,
        { subscriptionId: sub.id },
      );

      created++;
    } catch (err) {
      logger.error({ err, subId: sub.id }, "Failed to create renewal notification");
    }
  }

  logger.info({ scanned: upcomingSubs.length, created }, "Renewal check complete");
}

export function startRenewalChecker(): void {
  // Run once at startup, then every 8 hours
  checkUpcomingRenewals().catch((err) =>
    logger.error({ err }, "Initial renewal check failed"),
  );

  setInterval(() => {
    checkUpcomingRenewals().catch((err) =>
      logger.error({ err }, "Scheduled renewal check failed"),
    );
  }, INTERVAL_MS);

  logger.info({ intervalHours: 8 }, "Renewal checker started");
}
