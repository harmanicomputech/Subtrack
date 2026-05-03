import { Router, type IRouter, type Request, type Response } from "express";
import { count, desc, ilike, or, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  subscriptionsTable,
  billingEventsTable,
  bankConnectionsTable,
  notificationsTable,
} from "@workspace/db";
import { requireAdminAuth } from "../middlewares/requireAdminAuth";
import {
  verifyAdminSecret,
  generateAdminToken,
  revokeAdminToken,
  getLogEntries,
} from "../lib/adminAuth";

const router: IRouter = Router();

// ── Feature flags (in-memory) ─────────────────────────────────────────────────
const featureFlags: Record<string, { enabled: boolean; description: string }> = {
  gmail_scanning: { enabled: true, description: "Enable Gmail-based subscription detection" },
  bank_sync: { enabled: true, description: "Enable Open Banking (TrueLayer) sync" },
  renewal_checker: { enabled: true, description: "Run automatic renewal reminder checker" },
  paystack_billing: { enabled: true, description: "Accept Paystack payments" },
  stripe_billing: { enabled: false, description: "Accept Stripe payments" },
  usage_insights: { enabled: true, description: "Show AI usage insight scores on subscriptions" },
};

// ── Masked env viewer ─────────────────────────────────────────────────────────
const TRACKED_ENV_KEYS = [
  "ADMIN_SECRET_KEY",
  "DATABASE_URL",
  "PAYSTACK_SECRET_KEY",
  "SESSION_SECRET",
  "STRIPE_SECRET_KEY",
  "STRIPE_PRICE_ID",
  "STRIPE_WEBHOOK_SECRET",
  "TRUELAYER_CLIENT_ID",
  "TRUELAYER_CLIENT_SECRET",
  "TRUELAYER_REDIRECT_URI",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "REPLIT_DOMAINS",
  "NODE_ENV",
  "PORT",
];

function maskValue(val: string | undefined): string {
  if (!val) return "(not set)";
  if (val.length <= 4) return "****";
  return val.slice(0, 4) + "*".repeat(Math.min(val.length - 4, 20));
}

// ── POST /api/admin/auth/login ────────────────────────────────────────────────
router.post("/admin/auth/login", (req: Request, res: Response): void => {
  const { secretKey } = req.body as { secretKey?: string };
  if (!secretKey || !verifyAdminSecret(secretKey)) {
    res.status(401).json({ error: "Invalid admin secret key" });
    return;
  }
  const token = generateAdminToken();
  res.json({ token });
});

// ── POST /api/admin/auth/logout ───────────────────────────────────────────────
router.post("/admin/auth/logout", requireAdminAuth, (req: Request, res: Response): void => {
  const token = req.headers.authorization?.slice(7);
  if (token) revokeAdminToken(token);
  res.status(204).end();
});

// ── GET /api/admin/auth/me ────────────────────────────────────────────────────
router.get("/admin/auth/me", requireAdminAuth, (_req: Request, res: Response): void => {
  res.json({ role: "admin", authenticated: true });
});

// ── GET /api/admin/health ─────────────────────────────────────────────────────
router.get("/admin/health", requireAdminAuth, async (_req: Request, res: Response): Promise<void> => {
  let dbOk = false;
  let dbLatencyMs = 0;
  try {
    const start = Date.now();
    await db.execute(sql`SELECT 1`);
    dbLatencyMs = Date.now() - start;
    dbOk = true;
  } catch {
    dbOk = false;
  }

  res.json({
    api: { status: "ok", uptime: Math.floor(process.uptime()) },
    db: { status: dbOk ? "ok" : "error", latencyMs: dbLatencyMs },
    env: process.env["NODE_ENV"] ?? "unknown",
    timestamp: new Date().toISOString(),
  });
});

// ── GET /api/admin/stats ──────────────────────────────────────────────────────
router.get("/admin/stats", requireAdminAuth, async (_req: Request, res: Response): Promise<void> => {
  const [
    [userCount],
    [subCount],
    [proUserCount],
    [billingEventCount],
    [bankConnCount],
  ] = await Promise.all([
    db.select({ c: count() }).from(usersTable),
    db.select({ c: count() }).from(subscriptionsTable),
    db
      .select({ c: count() })
      .from(usersTable)
      .where(sql`${usersTable.subscriptionStatus} = 'active'`),
    db.select({ c: count() }).from(billingEventsTable),
    db.select({ c: count() }).from(bankConnectionsTable),
  ]);

  res.json({
    totalUsers: userCount?.c ?? 0,
    totalSubscriptions: subCount?.c ?? 0,
    proUsers: proUserCount?.c ?? 0,
    freeUsers: (userCount?.c ?? 0) - (proUserCount?.c ?? 0),
    billingEvents: billingEventCount?.c ?? 0,
    bankConnections: bankConnCount?.c ?? 0,
  });
});

// ── GET /api/admin/users ──────────────────────────────────────────────────────
router.get("/admin/users", requireAdminAuth, async (req: Request, res: Response): Promise<void> => {
  const rawLimit = Number(req.query["limit"] ?? 50);
  const rawOffset = Number(req.query["offset"] ?? 0);
  const search = req.query["search"] as string | undefined;

  const limit = Math.min(Math.max(1, rawLimit), 200);
  const offset = Math.max(0, rawOffset);

  const baseQuery = db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      name: usersTable.name,
      subscriptionStatus: usersTable.subscriptionStatus,
      subscriptionPlan: usersTable.subscriptionPlan,
      billingProvider: usersTable.billingProvider,
      stripeCustomerId: usersTable.stripeCustomerId,
      googleId: usersTable.googleId,
      createdAt: usersTable.createdAt,
      updatedAt: usersTable.updatedAt,
    })
    .from(usersTable);

  const rows = search
    ? await baseQuery
        .where(or(ilike(usersTable.email, `%${search}%`), ilike(usersTable.name, `%${search}%`)))
        .orderBy(desc(usersTable.createdAt))
        .limit(limit)
        .offset(offset)
    : await baseQuery
        .orderBy(desc(usersTable.createdAt))
        .limit(limit)
        .offset(offset);

  const [totalRow] = search
    ? await db
        .select({ c: count() })
        .from(usersTable)
        .where(or(ilike(usersTable.email, `%${search}%`), ilike(usersTable.name, `%${search}%`)))
    : await db.select({ c: count() }).from(usersTable);

  res.json({ users: rows, total: totalRow?.c ?? 0, limit, offset });
});

// ── GET /api/admin/users/:id ──────────────────────────────────────────────────
router.get("/admin/users/:id", requireAdminAuth, async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params["id"]);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid user id" }); return; }

  const [user] = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      name: usersTable.name,
      subscriptionStatus: usersTable.subscriptionStatus,
      subscriptionPlan: usersTable.subscriptionPlan,
      billingProvider: usersTable.billingProvider,
      stripeCustomerId: usersTable.stripeCustomerId,
      stripeSubscriptionId: usersTable.stripeSubscriptionId,
      paymentReference: usersTable.paymentReference,
      googleId: usersTable.googleId,
      gmailLastSyncAt: usersTable.gmailLastSyncAt,
      createdAt: usersTable.createdAt,
      updatedAt: usersTable.updatedAt,
    })
    .from(usersTable)
    .where(sql`${usersTable.id} = ${id}`)
    .limit(1);

  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const [subCountRow] = await db
    .select({ c: count() })
    .from(subscriptionsTable)
    .where(sql`${subscriptionsTable.userId} = ${id}`);

  const [notifCountRow] = await db
    .select({ c: count() })
    .from(notificationsTable)
    .where(sql`${notificationsTable.userId} = ${id}`);

  res.json({
    ...user,
    subscriptionCount: subCountRow?.c ?? 0,
    notificationCount: notifCountRow?.c ?? 0,
  });
});

// ── GET /api/admin/billing ────────────────────────────────────────────────────
router.get("/admin/billing", requireAdminAuth, (_req: Request, res: Response): void => {
  const hasPaystack = !!process.env["PAYSTACK_SECRET_KEY"];
  const hasStripe = !!(process.env["STRIPE_SECRET_KEY"] && process.env["STRIPE_PRICE_ID"]);

  res.json({
    providers: [
      {
        name: "paystack",
        label: "Paystack",
        configured: hasPaystack,
        active: hasPaystack && !hasStripe,
        keys: {
          PAYSTACK_SECRET_KEY: maskValue(process.env["PAYSTACK_SECRET_KEY"]),
        },
      },
      {
        name: "stripe",
        label: "Stripe",
        configured: hasStripe,
        active: hasStripe,
        keys: {
          STRIPE_SECRET_KEY: maskValue(process.env["STRIPE_SECRET_KEY"]),
          STRIPE_PRICE_ID: maskValue(process.env["STRIPE_PRICE_ID"]),
          STRIPE_WEBHOOK_SECRET: maskValue(process.env["STRIPE_WEBHOOK_SECRET"]),
        },
      },
    ],
    activeProvider: hasStripe ? "stripe" : hasPaystack ? "paystack" : null,
  });
});

// ── GET /api/admin/integrations ───────────────────────────────────────────────
router.get("/admin/integrations", requireAdminAuth, (_req: Request, res: Response): void => {
  res.json({
    truelayer: {
      label: "TrueLayer (Open Banking)",
      configured: !!(
        process.env["TRUELAYER_CLIENT_ID"] &&
        process.env["TRUELAYER_CLIENT_SECRET"] &&
        process.env["TRUELAYER_REDIRECT_URI"]
      ),
      keys: {
        TRUELAYER_CLIENT_ID: maskValue(process.env["TRUELAYER_CLIENT_ID"]),
        TRUELAYER_CLIENT_SECRET: maskValue(process.env["TRUELAYER_CLIENT_SECRET"]),
        TRUELAYER_REDIRECT_URI: process.env["TRUELAYER_REDIRECT_URI"] ?? "(not set)",
      },
    },
    google: {
      label: "Google / Gmail",
      configured: !!(process.env["GOOGLE_CLIENT_ID"] && process.env["GOOGLE_CLIENT_SECRET"]),
      keys: {
        GOOGLE_CLIENT_ID: maskValue(process.env["GOOGLE_CLIENT_ID"]),
        GOOGLE_CLIENT_SECRET: maskValue(process.env["GOOGLE_CLIENT_SECRET"]),
      },
    },
    database: {
      label: "PostgreSQL Database",
      configured: !!process.env["DATABASE_URL"],
      keys: {
        DATABASE_URL: maskValue(process.env["DATABASE_URL"]),
      },
    },
  });
});

// ── GET /api/admin/env ────────────────────────────────────────────────────────
router.get("/admin/env", requireAdminAuth, (_req: Request, res: Response): void => {
  const vars = TRACKED_ENV_KEYS.map((key) => ({
    key,
    value: maskValue(process.env[key]),
    set: !!process.env[key],
  }));
  res.json({ vars });
});

// ── GET /api/admin/flags ──────────────────────────────────────────────────────
router.get("/admin/flags", requireAdminAuth, (_req: Request, res: Response): void => {
  const flags = Object.entries(featureFlags).map(([key, val]) => ({
    key,
    enabled: val.enabled,
    description: val.description,
  }));
  res.json({ flags });
});

// ── PUT /api/admin/flags/:key ─────────────────────────────────────────────────
router.put("/admin/flags/:key", requireAdminAuth, (req: Request, res: Response): void => {
  const key = req.params["key"];
  if (!key || !(key in featureFlags)) {
    res.status(404).json({ error: "Flag not found" });
    return;
  }
  const { enabled } = req.body as { enabled?: boolean };
  if (typeof enabled !== "boolean") {
    res.status(400).json({ error: "enabled must be a boolean" });
    return;
  }
  featureFlags[key]!.enabled = enabled;
  res.json({ key, enabled, description: featureFlags[key]!.description });
});

// ── GET /api/admin/logs ───────────────────────────────────────────────────────
router.get("/admin/logs", requireAdminAuth, (req: Request, res: Response): void => {
  const limit = Math.min(Number(req.query["limit"] ?? 100), 200);
  res.json({ logs: getLogEntries(limit) });
});

export default router;
