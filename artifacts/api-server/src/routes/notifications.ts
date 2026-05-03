import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, notificationsTable, notificationPreferencesTable } from "@workspace/db";
import { MarkNotificationReadParams } from "@workspace/api-zod";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();

function formatNotification(n: typeof notificationsTable.$inferSelect) {
  return {
    id: n.id,
    userId: n.userId,
    title: n.title,
    message: n.message,
    type: n.type,
    isRead: n.isRead,
    subscriptionId: n.subscriptionId ?? null,
    metadata: n.metadata ?? null,
    createdAt: n.createdAt.toISOString(),
  };
}

// ── GET /api/notifications ────────────────────────────────────────────────────
router.get("/notifications", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const notifications = await db
    .select()
    .from(notificationsTable)
    .where(eq(notificationsTable.userId, req.userId!));

  res.json(notifications.map(formatNotification));
});

// ── PATCH /api/notifications/:id/read ─────────────────────────────────────────
router.patch("/notifications/:id/read", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = MarkNotificationReadParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [notification] = await db
    .update(notificationsTable)
    .set({ isRead: true })
    .where(and(eq(notificationsTable.id, params.data.id), eq(notificationsTable.userId, req.userId!)))
    .returning();

  if (!notification) {
    res.status(404).json({ error: "Notification not found" });
    return;
  }

  res.json(formatNotification(notification));
});

// ── POST /api/notifications/read-all ──────────────────────────────────────────
router.post("/notifications/read-all", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  await db
    .update(notificationsTable)
    .set({ isRead: true })
    .where(eq(notificationsTable.userId, req.userId!));

  res.sendStatus(204);
});

// ── GET /api/notifications/preferences ────────────────────────────────────────
router.get("/notifications/preferences", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const [prefs] = await db
    .select()
    .from(notificationPreferencesTable)
    .where(eq(notificationPreferencesTable.userId, req.userId!))
    .limit(1);

  res.json(
    prefs ?? {
      userId: req.userId,
      emailEnabled: true,
      renewalAlerts: true,
      insightsAlerts: true,
      marketingEmails: false,
    },
  );
});

// ── PATCH /api/notifications/preferences ──────────────────────────────────────
router.patch("/notifications/preferences", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const { emailEnabled, renewalAlerts, insightsAlerts, marketingEmails } = body;

  // Fetch existing prefs so we only override what was sent
  const [existing] = await db
    .select()
    .from(notificationPreferencesTable)
    .where(eq(notificationPreferencesTable.userId, req.userId!))
    .limit(1);

  const merged = {
    emailEnabled: typeof emailEnabled === "boolean" ? emailEnabled : (existing?.emailEnabled ?? true),
    renewalAlerts: typeof renewalAlerts === "boolean" ? renewalAlerts : (existing?.renewalAlerts ?? true),
    insightsAlerts: typeof insightsAlerts === "boolean" ? insightsAlerts : (existing?.insightsAlerts ?? true),
    marketingEmails: typeof marketingEmails === "boolean" ? marketingEmails : (existing?.marketingEmails ?? false),
  };

  await db
    .insert(notificationPreferencesTable)
    .values({ userId: req.userId!, ...merged })
    .onConflictDoUpdate({
      target: notificationPreferencesTable.userId,
      set: merged,
    });

  const [prefs] = await db
    .select()
    .from(notificationPreferencesTable)
    .where(eq(notificationPreferencesTable.userId, req.userId!))
    .limit(1);

  res.json(prefs);
});

export default router;
