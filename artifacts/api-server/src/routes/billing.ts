import { Router, type IRouter, type Request, type Response } from "express";
import { eq, desc } from "drizzle-orm";
import { db, usersTable, billingEventsTable, VALID_BILLING_EVENT_TYPES } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { logger } from "../lib/logger";
import { getBillingProvider } from "../lib/billing";

const router: IRouter = Router();

function getDomain(): string {
  const domains = process.env["REPLIT_DOMAINS"] ?? "";
  const first = domains.split(",")[0]?.trim();
  return first ? `https://${first}` : "http://localhost:80";
}

function makeDemoId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 14)}`;
}

// ── GET /api/billing/status ────────────────────────────────────────────────
router.get("/billing/status", requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const [user] = await db.select({
    subscriptionStatus: usersTable.subscriptionStatus,
    subscriptionPlan: usersTable.subscriptionPlan,
    billingProvider: usersTable.billingProvider,
  }).from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);

  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json({
    subscriptionStatus: user.subscriptionStatus,
    subscriptionPlan: user.subscriptionPlan ?? null,
    billingProvider: user.billingProvider ?? null,
  });
});

// ── POST /api/billing/create-checkout-session ──────────────────────────────
router.post("/billing/create-checkout-session", requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  try {
    const provider = getBillingProvider();
    const result = await provider.createCheckoutSession(user, getDomain());
    res.json({ url: result.url, provider: provider.name });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message.includes("not configured")) {
      res.status(503).json({ error: "Billing not configured" });
    } else {
      req.log.error({ err }, "Checkout session creation failed");
      res.status(500).json({ error: "Failed to create checkout session" });
    }
  }
});

// ── POST /api/billing/demo-confirm ─────────────────────────────────────────
router.post("/billing/demo-confirm", requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.userId!;

  const fakeCusId = makeDemoId("demo_cus");
  const fakeSubId = makeDemoId("demo_sub");

  await db.update(usersTable).set({
    stripeCustomerId: fakeCusId,
    stripeSubscriptionId: fakeSubId,
    subscriptionStatus: "active",
    subscriptionPlan: "pro",
    billingProvider: "stripe",
    paymentReference: makeDemoId("demo_pi"),
  }).where(eq(usersTable.id, userId));

  logger.info({ userId, fakeCusId, fakeSubId }, "Demo checkout confirmed — Pro activated");
  res.json({ success: true, subscriptionStatus: "active", subscriptionPlan: "pro" });
});

// ── POST /api/billing/events ───────────────────────────────────────────────
// Fire-and-forget: non-blocking audit trail for billing actions.
router.post("/billing/events", requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { type, label, metadata } = req.body as { type?: string; label?: string; metadata?: Record<string, unknown> };

  if (!type || !(VALID_BILLING_EVENT_TYPES as readonly string[]).includes(type)) {
    res.status(400).json({ error: "Invalid or missing event type" });
    return;
  }

  try {
    await db.insert(billingEventsTable).values({
      userId: req.userId!,
      type,
      label: label ?? null,
      metadata: metadata ?? null,
    });
    res.status(201).json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to write billing event");
    res.status(500).json({ error: "Failed to write event" });
  }
});

// ── GET /api/billing/events ────────────────────────────────────────────────
router.get("/billing/events", requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const events = await db
      .select()
      .from(billingEventsTable)
      .where(eq(billingEventsTable.userId, req.userId!))
      .orderBy(desc(billingEventsTable.createdAt))
      .limit(50);
    res.json(events);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch billing events");
    res.status(500).json({ error: "Failed to fetch events" });
  }
});

// ── POST /api/webhooks/stripe ──────────────────────────────────────────────
router.post("/webhooks/stripe", async (req: Request, res: Response): Promise<void> => {
  const provider = getBillingProvider();
  try {
    await provider.handleWebhook(req.body as Buffer, req.headers as Record<string, string>);
    res.json({ received: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "";
    if (message.includes("signature") || message.includes("Invalid")) {
      res.status(400).send("Webhook signature invalid");
    } else {
      logger.error({ err }, "Stripe webhook handler error");
      res.status(500).send("Webhook handler error");
    }
  }
});

export default router;
