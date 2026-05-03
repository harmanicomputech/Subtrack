import { and, eq, gte, sql } from "drizzle-orm";
import { db, notificationsTable, notificationPreferencesTable, usersTable } from "@workspace/db";
import { logger } from "./logger";

/**
 * Creates an in-app notification and optionally sends an email if:
 * - RESEND_API_KEY is configured
 * - user's notification preferences allow it for the given type
 *
 * Never throws — all errors are logged and swallowed so callers are unaffected.
 */
export async function createNotification(
  userId: number,
  type: string,
  title: string,
  message: string,
  options?: {
    subscriptionId?: number;
    metadata?: Record<string, unknown>;
    skipEmail?: boolean;
  },
): Promise<void> {
  try {
    await db.insert(notificationsTable).values({
      userId,
      type,
      title,
      message,
      isRead: false,
      subscriptionId: options?.subscriptionId ?? null,
      metadata: options?.metadata ?? null,
    });
  } catch (err) {
    logger.error({ err, userId, type }, "Failed to write notification to DB");
    return;
  }

  if (!options?.skipEmail) {
    maybeEmailUser(userId, type, title, message).catch((err) =>
      logger.error({ err, userId, type }, "Email notification failed (non-blocking)"),
    );
  }
}

/**
 * Returns true if a "new_subscription_detected" notification was already sent
 * for this merchant within the last 48 hours — prevents notification spam when
 * the same service is detected by both bank and email in quick succession.
 */
export async function hasRecentNewSubNotification(
  userId: number,
  merchantName: string,
): Promise<boolean> {
  const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const [existing] = await db
    .select({ id: notificationsTable.id })
    .from(notificationsTable)
    .where(
      and(
        eq(notificationsTable.userId, userId),
        eq(notificationsTable.type, "new_subscription_detected"),
        gte(notificationsTable.createdAt, fortyEightHoursAgo),
        sql`${notificationsTable.metadata}->>'merchantName' = ${merchantName}`,
      ),
    )
    .limit(1);
  return !!existing;
}

async function maybeEmailUser(
  userId: number,
  type: string,
  title: string,
  message: string,
): Promise<void> {
  const resendApiKey = process.env["RESEND_API_KEY"];
  if (!resendApiKey) return;

  const [prefs] = await db
    .select()
    .from(notificationPreferencesTable)
    .where(eq(notificationPreferencesTable.userId, userId))
    .limit(1);

  const emailEnabled = prefs?.emailEnabled ?? true;
  const renewalAlerts = prefs?.renewalAlerts ?? true;
  const insightsAlerts = prefs?.insightsAlerts ?? true;

  if (!emailEnabled) return;
  if (type === "renewal_alert" && !renewalAlerts) return;
  if (
    (type === "unused_subscriptions" ||
      type === "new_subscription_detected" ||
      type === "email_scan_complete") &&
    !insightsAlerts
  )
    return;

  const [user] = await db
    .select({ email: usersTable.email, name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user) return;

  await sendEmailNotification(resendApiKey, user, title, message);
}

async function sendEmailNotification(
  apiKey: string,
  user: { email: string; name: string },
  subject: string,
  body: string,
): Promise<void> {
  const domains = process.env["REPLIT_DOMAINS"] ?? "";
  const domain = domains.split(",")[0]?.trim();
  const appUrl = domain ? `https://${domain}` : "https://subtrack.app";

  const textBody = [
    `Hi ${user.name},`,
    "",
    body,
    "",
    `Review your subscriptions: ${appUrl}/subscriptions`,
    "",
    "---",
    "You're receiving this because you have notifications enabled in Recuris.",
    `Manage your preferences: ${appUrl}/settings`,
  ].join("\n");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Recuris <notifications@recuris.app>",
      to: user.email,
      subject,
      text: textBody,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Resend API error ${response.status}: ${errText}`);
  }
}
