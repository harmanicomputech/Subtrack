import { Router, type IRouter } from "express";
import { eq, and, gte } from "drizzle-orm";
import { db, subscriptionsTable, savingsTable, notificationsTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/dashboard/summary", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const allSubs = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.userId, req.userId!));

  const activeSubs = allSubs.filter((s) => s.status === "active");
  const cancelledSubs = allSubs.filter((s) => s.status === "cancelled");

  const totalMonthlySpend = activeSubs.reduce((sum, s) => {
    const amount = Number(s.amount);
    if (s.billingCycle === "monthly") return sum + amount;
    if (s.billingCycle === "yearly") return sum + amount / 12;
    if (s.billingCycle === "weekly") return sum + amount * 4.33;
    return sum;
  }, 0);

  const totalYearlySpend = totalMonthlySpend * 12;

  const now = new Date();
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const upcomingRenewals = activeSubs.filter((s) => {
    if (!s.nextRenewalDate) return false;
    return s.nextRenewalDate >= now && s.nextRenewalDate <= thirtyDaysFromNow;
  });

  const allSavings = await db
    .select()
    .from(savingsTable)
    .where(eq(savingsTable.userId, req.userId!));

  const totalSaved = allSavings.reduce((sum, s) => sum + Number(s.amountSaved), 0);

  const unreadNotifications = await db
    .select()
    .from(notificationsTable)
    .where(and(eq(notificationsTable.userId, req.userId!), eq(notificationsTable.isRead, false)));

  res.json({
    totalMonthlySpend: Math.round(totalMonthlySpend * 100) / 100,
    totalYearlySpend: Math.round(totalYearlySpend * 100) / 100,
    activeSubscriptions: activeSubs.length,
    cancelledSubscriptions: cancelledSubs.length,
    totalSaved: Math.round(totalSaved * 100) / 100,
    upcomingRenewalsCount: upcomingRenewals.length,
    unreadNotifications: unreadNotifications.length,
  });
});

router.get("/dashboard/upcoming-renewals", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const now = new Date();
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const subs = await db
    .select()
    .from(subscriptionsTable)
    .where(and(eq(subscriptionsTable.userId, req.userId!), eq(subscriptionsTable.status, "active")));

  const upcoming = subs.filter((s) => {
    if (!s.nextRenewalDate) return false;
    return s.nextRenewalDate >= now && s.nextRenewalDate <= thirtyDaysFromNow;
  });

  res.json(upcoming.map((s) => ({
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
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  })));
});

router.get("/dashboard/spend-by-category", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const activeSubs = await db
    .select()
    .from(subscriptionsTable)
    .where(and(eq(subscriptionsTable.userId, req.userId!), eq(subscriptionsTable.status, "active")));

  const categoryMap = new Map<string, { amount: number; count: number }>();

  for (const sub of activeSubs) {
    const cat = sub.category ?? "Other";
    const existing = categoryMap.get(cat) ?? { amount: 0, count: 0 };
    let monthly = Number(sub.amount);
    if (sub.billingCycle === "yearly") monthly = monthly / 12;
    if (sub.billingCycle === "weekly") monthly = monthly * 4.33;
    categoryMap.set(cat, { amount: existing.amount + monthly, count: existing.count + 1 });
  }

  const result = Array.from(categoryMap.entries()).map(([category, data]) => ({
    category,
    amount: Math.round(data.amount * 100) / 100,
    count: data.count,
  }));

  res.json(result);
});

export default router;
