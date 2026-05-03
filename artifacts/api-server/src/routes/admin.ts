import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { count, desc, ilike, or, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  subscriptionsTable,
  billingEventsTable,
  bankConnectionsTable,
  notificationsTable,
  adminAuditLogsTable,
} from "@workspace/db";
import { requireAdminAuth } from "../middlewares/requireAdminAuth";
import {
  verifyAdminSecret,
  generateAdminToken,
  validateAdminToken,
  revokeAdminToken,
  isTokenRevoked,
  checkBruteForce,
  recordFailedAttempt,
  clearFailedAttempts,
  getLogEntries,
} from "../lib/adminAuth";

const router: IRouter = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0]?.trim() ?? "unknown";
  return req.socket?.remoteAddress ?? "unknown";
}

async function insertAuditLog(
  action: string,
  metadata: Record<string, unknown>,
  ipAddress: string,
): Promise<void> {
  try {
    await db.insert(adminAuditLogsTable).values({ action, actor: "admin", metadata, ipAddress });
  } catch (err) {
    // Audit log failures must not break the request
    console.error("Audit log insert failed:", err);
  }
}

// ── Feature flags (in-memory) ─────────────────────────────────────────────────
const featureFlags: Record<string, { enabled: boolean; description: string }> = {
  gmail_scanning:   { enabled: true,  description: "Enable Gmail-based subscription detection" },
  bank_sync:        { enabled: true,  description: "Enable Open Banking (TrueLayer) sync" },
  renewal_checker:  { enabled: true,  description: "Run automatic renewal reminder checker" },
  paystack_billing: { enabled: true,  description: "Accept Paystack payments" },
  stripe_billing:   { enabled: false, description: "Accept Stripe payments" },
  usage_insights:   { enabled: true,  description: "Show AI usage insight scores on subscriptions" },
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

// ── Origin validation middleware (admin routes only) ──────────────────────────
function validateAdminOrigin(req: Request, res: Response, next: NextFunction): void {
  // Allow requests that carry a valid admin token (already proved they're authenticated)
  // Skip origin check in development to allow Replit preview pane
  if (process.env["NODE_ENV"] === "production") {
    const origin = req.headers.origin ?? req.headers.referer ?? "";
    const allowedDomains = (process.env["REPLIT_DOMAINS"] ?? "").split(",").map((d) => d.trim());
    const allowed = allowedDomains.some((d) => origin.includes(d));
    if (!allowed && origin) {
      res.status(403).json({ error: "Forbidden origin" });
      return;
    }
  }
  next();
}

router.use("/admin", validateAdminOrigin);

// ── POST /api/admin/auth/login ────────────────────────────────────────────────
router.post("/admin/auth/login", (req: Request, res: Response): void => {
  const ip = getClientIp(req);

  // Brute-force check
  const bruteCheck = checkBruteForce(ip);
  if (bruteCheck.blocked) {
    res.status(429).json({
      error: `Too many failed attempts. Try again in ${bruteCheck.retryAfterSec}s.`,
      retryAfterSec: bruteCheck.retryAfterSec,
    });
    return;
  }

  const { secretKey } = req.body as { secretKey?: string };
  if (!secretKey || !verifyAdminSecret(secretKey)) {
    recordFailedAttempt(ip);
    res.status(401).json({ error: "Invalid admin secret key" });
    return;
  }

  clearFailedAttempts(ip);
  const token = generateAdminToken();
  // expiresAt is encoded in the token — also return it for the client's session store
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000;

  void insertAuditLog("admin.login", { ip }, ip);
  res.json({ token, expiresAt });
});

// ── POST /api/admin/auth/refresh ──────────────────────────────────────────────
router.post("/admin/auth/refresh", requireAdminAuth, (req: Request, res: Response): void => {
  const oldToken = req.headers.authorization?.slice(7) ?? "";
  revokeAdminToken(oldToken);
  const token = generateAdminToken();
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
  res.json({ token, expiresAt });
});

// ── POST /api/admin/auth/logout ───────────────────────────────────────────────
router.post("/admin/auth/logout", requireAdminAuth, (req: Request, res: Response): void => {
  const token = req.headers.authorization?.slice(7);
  if (token) revokeAdminToken(token);
  void insertAuditLog("admin.logout", {}, getClientIp(req));
  res.status(204).end();
});

// ── GET /api/admin/auth/me ────────────────────────────────────────────────────
router.get("/admin/auth/me", requireAdminAuth, (req: Request, res: Response): void => {
  const token = req.headers.authorization?.slice(7) ?? "";
  const validation = validateAdminToken(token);
  res.json({
    role: "admin",
    authenticated: true,
    expiresAt: validation.payload?.exp,
    nearExpiry: validation.nearExpiry ?? false,
  });
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
  } catch { dbOk = false; }

  res.json({
    api: { status: "ok", uptime: Math.floor(process.uptime()) },
    db: { status: dbOk ? "ok" : "error", latencyMs: dbLatencyMs },
    env: process.env["NODE_ENV"] ?? "unknown",
    timestamp: new Date().toISOString(),
  });
});

// ── GET /api/admin/stats ──────────────────────────────────────────────────────
router.get("/admin/stats", requireAdminAuth, async (_req: Request, res: Response): Promise<void> => {
  const [[userCount], [subCount], [proUserCount], [billingEventCount], [bankConnCount]] =
    await Promise.all([
      db.select({ c: count() }).from(usersTable),
      db.select({ c: count() }).from(subscriptionsTable),
      db.select({ c: count() }).from(usersTable).where(sql`${usersTable.subscriptionStatus} = 'active'`),
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

  const baseQuery = db.select({
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
  }).from(usersTable);

  const [rows, [totalRow]] = await Promise.all([
    search
      ? baseQuery.where(or(ilike(usersTable.email, `%${search}%`), ilike(usersTable.name, `%${search}%`))).orderBy(desc(usersTable.createdAt)).limit(limit).offset(offset)
      : baseQuery.orderBy(desc(usersTable.createdAt)).limit(limit).offset(offset),
    search
      ? db.select({ c: count() }).from(usersTable).where(or(ilike(usersTable.email, `%${search}%`), ilike(usersTable.name, `%${search}%`)))
      : db.select({ c: count() }).from(usersTable),
  ]);

  res.json({ users: rows, total: totalRow?.c ?? 0, limit, offset });
});

// ── GET /api/admin/users/:id ──────────────────────────────────────────────────
router.get("/admin/users/:id", requireAdminAuth, async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id as string | undefined);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid user id" }); return; }

  const ip = getClientIp(req);
  void insertAuditLog("view_user_detail", { userId: id }, ip);

  const [[user], [subCountRow], [notifCountRow]] = await Promise.all([
    db.select({
      id: usersTable.id, email: usersTable.email, name: usersTable.name,
      subscriptionStatus: usersTable.subscriptionStatus, subscriptionPlan: usersTable.subscriptionPlan,
      billingProvider: usersTable.billingProvider, stripeCustomerId: usersTable.stripeCustomerId,
      stripeSubscriptionId: usersTable.stripeSubscriptionId, paymentReference: usersTable.paymentReference,
      googleId: usersTable.googleId, gmailLastSyncAt: usersTable.gmailLastSyncAt,
      createdAt: usersTable.createdAt, updatedAt: usersTable.updatedAt,
    }).from(usersTable).where(sql`${usersTable.id} = ${id}`).limit(1),
    db.select({ c: count() }).from(subscriptionsTable).where(sql`${subscriptionsTable.userId} = ${id}`),
    db.select({ c: count() }).from(notificationsTable).where(sql`${notificationsTable.userId} = ${id}`),
  ]);

  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json({ ...user, subscriptionCount: subCountRow?.c ?? 0, notificationCount: notifCountRow?.c ?? 0 });
});

// ── GET /api/admin/billing ────────────────────────────────────────────────────
router.get("/admin/billing", requireAdminAuth, (_req: Request, res: Response): void => {
  const hasPaystack = !!process.env["PAYSTACK_SECRET_KEY"];
  const hasStripe = !!(process.env["STRIPE_SECRET_KEY"] && process.env["STRIPE_PRICE_ID"]);
  res.json({
    providers: [
      {
        name: "paystack", label: "Paystack", configured: hasPaystack, active: hasPaystack && !hasStripe,
        keys: { PAYSTACK_SECRET_KEY: maskValue(process.env["PAYSTACK_SECRET_KEY"]) },
      },
      {
        name: "stripe", label: "Stripe", configured: hasStripe, active: hasStripe,
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
      configured: !!(process.env["TRUELAYER_CLIENT_ID"] && process.env["TRUELAYER_CLIENT_SECRET"] && process.env["TRUELAYER_REDIRECT_URI"]),
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
      keys: { DATABASE_URL: maskValue(process.env["DATABASE_URL"]) },
    },
  });
});

// ── GET /api/admin/env ────────────────────────────────────────────────────────
router.get("/admin/env", requireAdminAuth, (_req: Request, res: Response): void => {
  res.json({
    vars: TRACKED_ENV_KEYS.map((key) => ({
      key,
      value: maskValue(process.env[key]),
      set: !!process.env[key],
    })),
  });
});

// ── GET /api/admin/flags ──────────────────────────────────────────────────────
router.get("/admin/flags", requireAdminAuth, (_req: Request, res: Response): void => {
  res.json({
    flags: Object.entries(featureFlags).map(([key, val]) => ({
      key, enabled: val.enabled, description: val.description,
    })),
  });
});

// ── PUT /api/admin/flags/:key ─────────────────────────────────────────────────
router.put("/admin/flags/:key", requireAdminAuth, async (req: Request, res: Response): Promise<void> => {
  const key = req.params.key as string | undefined;
  if (!key || !(key in featureFlags)) { res.status(404).json({ error: "Flag not found" }); return; }
  const { enabled } = req.body as { enabled?: boolean };
  if (typeof enabled !== "boolean") { res.status(400).json({ error: "enabled must be a boolean" }); return; }

  const previous = featureFlags[key]!.enabled;
  featureFlags[key]!.enabled = enabled;

  void insertAuditLog("feature_flag.toggle", { flag: key, from: previous, to: enabled }, getClientIp(req));

  res.json({ key, enabled, description: featureFlags[key]!.description });
});

// ── GET /api/admin/audit-logs ─────────────────────────────────────────────────
router.get("/admin/audit-logs", requireAdminAuth, async (req: Request, res: Response): Promise<void> => {
  const limit = Math.min(Number(req.query["limit"] ?? 50), 200);
  const logs = await db
    .select()
    .from(adminAuditLogsTable)
    .orderBy(desc(adminAuditLogsTable.createdAt))
    .limit(limit);
  res.json({ logs });
});

// ── GET /api/admin/logs ───────────────────────────────────────────────────────
router.get("/admin/logs", requireAdminAuth, (req: Request, res: Response): void => {
  const limit = Math.min(Number(req.query["limit"] ?? 100), 200);
  res.json({ logs: getLogEntries(limit) });
});

export default router;
