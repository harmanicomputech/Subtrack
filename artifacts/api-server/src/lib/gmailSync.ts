import { db, usersTable, notificationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { parseEmailToSubscription, extractDomain, extractSenderName, type ParsedEmail } from "./emailParser";
import { upsertWithDeduplication, initialConfidence, isTrialEmail } from "./deduplication";
import { createNotification, hasRecentNewSubNotification } from "./notificationService";
import { logger } from "./logger";

export interface GmailSyncResult {
  emailsScanned: number;
  subscriptionsFound: number;
  subscriptionsAdded: number;
  subscriptionsMerged: number;
  duplicatesSkipped: number;
}

const GMAIL_QUERY = [
  "subject:(subscription OR invoice OR receipt OR renewal OR billing OR payment OR \"free trial\" OR \"trial ending\")",
  "newer_than:6m",
  "-label:spam",
].join(" ");

async function fetchGmailMessages(accessToken: string): Promise<ParsedEmail[]> {
  const baseUrl = "https://gmail.googleapis.com/gmail/v1/users/me";
  const headers = { Authorization: `Bearer ${accessToken}` };

  const listRes = await fetch(
    `${baseUrl}/messages?q=${encodeURIComponent(GMAIL_QUERY)}&maxResults=100`,
    { headers },
  );

  if (!listRes.ok) {
    const err = await listRes.text();
    throw new Error(`Gmail list failed: ${listRes.status} ${err}`);
  }

  const listData = await listRes.json() as { messages?: Array<{ id: string }> };
  const messageIds = listData.messages ?? [];

  const emails: ParsedEmail[] = [];

  await Promise.all(
    messageIds.map(async ({ id }) => {
      const msgRes = await fetch(
        `${baseUrl}/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
        { headers },
      );
      if (!msgRes.ok) return;

      const msg = await msgRes.json() as {
        id: string;
        snippet: string;
        payload?: { headers?: Array<{ name: string; value: string }> };
      };

      const getHeader = (name: string) =>
        msg.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";

      const fromHeader = getHeader("From");
      const subject = getHeader("Subject");
      const date = getHeader("Date");
      const domain = extractDomain(fromHeader);
      const senderName = extractSenderName(fromHeader);

      emails.push({
        messageId: msg.id,
        senderDomain: domain,
        senderName,
        subject,
        snippet: msg.snippet ?? "",
        date,
      });
    }),
  );

  return emails;
}

export async function syncGmail(userId: number): Promise<GmailSyncResult> {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user?.googleAccessToken) {
    throw new Error("No Gmail access token found. Please connect your Google account first.");
  }

  const emails = await fetchGmailMessages(user.googleAccessToken);
  const result: GmailSyncResult = {
    emailsScanned: emails.length,
    subscriptionsFound: 0,
    subscriptionsAdded: 0,
    subscriptionsMerged: 0,
    duplicatesSkipped: 0,
  };

  const processedThisScan = new Set<string>();

  for (const email of emails) {
    const detected = parseEmailToSubscription(email);
    if (!detected) continue;

    result.subscriptionsFound++;

    const nameKey = detected.merchantName.toLowerCase();
    if (processedThisScan.has(nameKey)) {
      result.duplicatesSkipped++;
      continue;
    }
    processedThisScan.add(nameKey);

    const isTrial = isTrialEmail(email.subject, email.snippet);
    const confidence = initialConfidence("email", isTrial ? "trial" : "receipt");

    const dedupResult = await upsertWithDeduplication({
      userId,
      merchantName: detected.merchantName,
      amount: detected.amount,
      billingCycle: detected.billingCycle,
      source: "email",
      emailMetadata: detected.emailMetadata as Record<string, unknown>,
      category: detected.category,
      confidenceScore: confidence,
    });

    if (dedupResult.action === "created") {
      result.subscriptionsAdded++;

      // ── Notify for high-confidence new email-detected subscriptions (≥ 0.7) ─
      // EMAIL_RECEIPT = 0.6 and EMAIL_TRIAL = 0.4, so this gate is rarely crossed
      // unless confidence was boosted (e.g. multi-source). Included for future-proofing.
      if (confidence >= 0.7) {
        const merchantName = detected.merchantName;
        const subId = dedupResult.subscriptionId;
        hasRecentNewSubNotification(userId, merchantName)
          .then((alreadyNotified) => {
            if (alreadyNotified) return;
            const detectedAmount = detected.amount ?? 0;
            const amountStr =
              detectedAmount > 0
                ? new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(detectedAmount)
                : "amount not available";
            const cycleClause = detected.billingCycle ? `/${detected.billingCycle}` : "";
            return createNotification(
              userId,
              "new_subscription_detected",
              `New subscription detected: ${merchantName}`,
              `We found a new subscription: ${merchantName} (${amountStr}${cycleClause}) — detected from your email receipts.`,
              {
                subscriptionId: subId,
                metadata: {
                  subscriptionId: subId,
                  merchantName,
                  amount: detected.amount,
                  billingCycle: detected.billingCycle,
                  source: "email",
                  confidenceScore: confidence,
                },
              },
            );
          })
          .catch((err) => logger.error({ err, merchantName }, "new_subscription_detected (email) notification failed"));
      }
    } else {
      result.subscriptionsMerged++;
    }
  }

  // Record sync time
  await db
    .update(usersTable)
    .set({ gmailLastSyncAt: new Date() })
    .where(eq(usersTable.id, userId));

  const newOrMerged = result.subscriptionsAdded + result.subscriptionsMerged;
  if (newOrMerged > 0) {
    const parts: string[] = [];
    if (result.subscriptionsAdded > 0) {
      parts.push(`${result.subscriptionsAdded} new subscription${result.subscriptionsAdded === 1 ? "" : "s"} found`);
    }
    if (result.subscriptionsMerged > 0) {
      parts.push(`${result.subscriptionsMerged} existing confirmed via email`);
    }

    await db.insert(notificationsTable).values({
      userId,
      type: "email_scan_complete",
      title: "Gmail Scan Complete",
      message: parts.join(", ") + ".",
      isRead: false,
    });
  }

  return result;
}
