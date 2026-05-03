import { Router, type IRouter } from "express";
import { eq, and, asc } from "drizzle-orm";
import { db, subscriptionsTable, notificationsTable, subscriptionAuditLogsTable } from "@workspace/db";
import {
  GetSubscriptionParams,
  UpdateSubscriptionParams,
  UpdateSubscriptionBody,
  ListSubscriptionsQueryParams,
} from "@workspace/api-zod";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { detectSubscriptions } from "../lib/subscriptionDetector";
import { analyseUserSubscriptions, getInsightReason } from "../lib/subscriptionInsights";
import { buildConfidenceBreakdown } from "../lib/deduplication";

const router: IRouter = Router();

function formatSubscription(s: typeof subscriptionsTable.$inferSelect) {
  const sources: string[] = Array.isArray(s.sources) ? (s.sources as string[]) : [s.source ?? "bank"];
  return {
    id: s.id,
    userId: s.userId,
    merchantName: s.merchantName,
    amount: Number(s.amount),
    currency: s.currency,
    billingCycle: s.billingCycle,
    nextRenewalDate: s.nextRenewalDate?.toISOString() ?? null,
    category: s.category ?? null,
    status: s.status,
    confidenceScore: s.confidenceScore,
    bankConnectionId: s.bankConnectionId ?? null,
    source: s.source ?? "bank",
    sources,
    emailMetadata: s.emailMetadata ?? null,
    lastDetectedAt: s.lastDetectedAt?.toISOString() ?? null,
    usageStatus: s.usageStatus ?? "active",
    unusedScore: s.unusedScore ?? 0,
    insightReason: getInsightReason(s),
    confidenceBreakdown: buildConfidenceBreakdown(s.confidenceScore, sources),
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

router.get("/subscriptions", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const parsed = ListSubscriptionsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  let subs = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.userId, req.userId!));

  if (parsed.data.status) {
    subs = subs.filter((s) => s.status === parsed.data.status);
  }

  // Apply usageStatus filter if requested
  const usageFilter = (req.query as Record<string, string>).usageStatus;
  if (usageFilter) {
    subs = subs.filter((s) => s.usageStatus === usageFilter);
  }

  res.json(subs.map(formatSubscription));
});

router.post("/subscriptions/detect", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const result = await detectSubscriptions(req.userId!);
  // Auto-run insights after detection
  await analyseUserSubscriptions(req.userId!);
  res.json(result);
});

// Run insights analysis and return summary
router.post("/subscriptions/analyze", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const summary = await analyseUserSubscriptions(req.userId!);

  // Create notification if unused subscriptions found
  if (summary.unused > 0) {
    const saving = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(summary.potentialMonthlySaving);
    await db.insert(notificationsTable).values({
      userId: req.userId!,
      type: "unused_subscriptions",
      title: "Potential savings found",
      message: `${summary.unused} subscription${summary.unused === 1 ? "" : "s"} may be unused — you could save ${saving}/month by cancelling them.`,
      isRead: false,
    }).onConflictDoNothing();
  }

  res.json(summary);
});

router.get("/subscriptions/:id/audit", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = GetSubscriptionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  // Verify subscription belongs to this user
  const [sub] = await db
    .select({ id: subscriptionsTable.id })
    .from(subscriptionsTable)
    .where(and(eq(subscriptionsTable.id, params.data.id), eq(subscriptionsTable.userId, req.userId!)))
    .limit(1);

  if (!sub) {
    res.status(404).json({ error: "Subscription not found" });
    return;
  }

  const logs = await db
    .select()
    .from(subscriptionAuditLogsTable)
    .where(eq(subscriptionAuditLogsTable.subscriptionId, params.data.id))
    .orderBy(asc(subscriptionAuditLogsTable.createdAt));

  res.json(
    logs.map((log) => ({
      id: log.id,
      subscriptionId: log.subscriptionId,
      eventType: log.eventType,
      source: log.source,
      metadata: log.metadata ?? null,
      createdAt: log.createdAt.toISOString(),
    })),
  );
});

router.post("/subscriptions/:id/mark-unused", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = GetSubscriptionParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [sub] = await db
    .update(subscriptionsTable)
    .set({ usageStatus: "unused", unusedScore: 1.0, updatedAt: new Date() })
    .where(and(eq(subscriptionsTable.id, params.data.id), eq(subscriptionsTable.userId, req.userId!)))
    .returning();

  if (!sub) { res.status(404).json({ error: "Subscription not found" }); return; }

  await db.insert(subscriptionAuditLogsTable).values({
    subscriptionId: sub.id,
    eventType: "updated",
    source: "user",
    metadata: { action: "mark_unused", previousUsageStatus: "active" },
  });

  await analyseUserSubscriptions(req.userId!);
  res.json(formatSubscription(sub));
});

router.post("/subscriptions/:id/ignore", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = GetSubscriptionParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [sub] = await db
    .update(subscriptionsTable)
    .set({ usageStatus: "ignored", updatedAt: new Date() })
    .where(and(eq(subscriptionsTable.id, params.data.id), eq(subscriptionsTable.userId, req.userId!)))
    .returning();

  if (!sub) { res.status(404).json({ error: "Subscription not found" }); return; }

  await db.insert(subscriptionAuditLogsTable).values({
    subscriptionId: sub.id,
    eventType: "ignored",
    source: "user",
    metadata: { action: "ignore", reason: "user_dismissed_onboarding" },
  });

  res.json(formatSubscription(sub));
});

router.get("/subscriptions/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = GetSubscriptionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [sub] = await db
    .select()
    .from(subscriptionsTable)
    .where(and(eq(subscriptionsTable.id, params.data.id), eq(subscriptionsTable.userId, req.userId!)))
    .limit(1);

  if (!sub) {
    res.status(404).json({ error: "Subscription not found" });
    return;
  }

  res.json(formatSubscription(sub));
});

router.patch("/subscriptions/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = UpdateSubscriptionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = UpdateSubscriptionBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const updates: Record<string, unknown> = {};
  if (body.data.status != null) updates.status = body.data.status;
  if (body.data.category != null) updates.category = body.data.category;
  if (body.data.nextRenewalDate != null) updates.nextRenewalDate = new Date(body.data.nextRenewalDate);

  const [sub] = await db
    .update(subscriptionsTable)
    .set(updates)
    .where(and(eq(subscriptionsTable.id, params.data.id), eq(subscriptionsTable.userId, req.userId!)))
    .returning();

  if (!sub) {
    res.status(404).json({ error: "Subscription not found" });
    return;
  }

  res.json(formatSubscription(sub));
});

export default router;
