import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { RegisterBody, LoginBody } from "@workspace/api-zod";
import {
  hashPassword,
  verifyPassword,
  generateToken,
  storeToken,
  revokeToken,
  createResetToken,
  consumeResetToken,
} from "../lib/auth";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ── POST /api/auth/register ───────────────────────────────────────────────────

router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { email, password, name } = parsed.data;

  const existing = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (existing.length > 0) {
    res.status(400).json({ error: "Email already registered" });
    return;
  }

  const [user] = await db.insert(usersTable).values({
    email,
    passwordHash: hashPassword(password),
    name,
  }).returning();

  const token = generateToken();
  storeToken(token, user.id);

  res.status(201).json({
    token,
    user: { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt.toISOString() },
  });
});

// ── POST /api/auth/login ──────────────────────────────────────────────────────

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { email, password } = parsed.data;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const token = generateToken();
  storeToken(token, user.id);

  res.json({
    token,
    user: { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt.toISOString() },
  });
});

// ── POST /api/auth/logout ─────────────────────────────────────────────────────

router.post("/auth/logout", (req, res): void => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    revokeToken(authHeader.slice(7));
  }
  res.sendStatus(204);
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────

router.get("/auth/me", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  res.json({ id: user.id, email: user.email, name: user.name, createdAt: user.createdAt.toISOString() });
});

// ── POST /api/auth/forgot-password ───────────────────────────────────────────
// Generates a reset token. In dev: logs link to console. In prod: send email.

router.post("/auth/forgot-password", async (req, res): Promise<void> => {
  const { email } = req.body as { email?: string };
  if (!email || typeof email !== "string") {
    res.status(400).json({ error: "Email is required" });
    return;
  }

  // Always return 200 to prevent email enumeration
  const [user] = await db
    .select({ id: usersTable.id, email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.email, email.trim().toLowerCase()))
    .limit(1);

  if (user) {
    const raw = createResetToken(user.id);
    const domain = process.env["REPLIT_DOMAINS"]?.split(",")[0]?.trim();
    const base = domain ? `https://${domain}` : "http://localhost:80";
    const resetLink = `${base}/reset-password?token=${raw}`;

    // DEV: log reset link — replace with email service (SendGrid, Resend, etc.) in production
    logger.info({ resetLink, userId: user.id }, "Password reset requested — use link in resetLink field (dev mode)");
  }

  res.json({ message: "If an account exists with that email, you will receive a reset link shortly." });
});

// ── POST /api/auth/reset-password ─────────────────────────────────────────────

router.post("/auth/reset-password", async (req, res): Promise<void> => {
  const { token, password } = req.body as { token?: string; password?: string };

  if (!token || !password || typeof token !== "string" || typeof password !== "string") {
    res.status(400).json({ error: "Token and new password are required" });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters" });
    return;
  }

  const userId = consumeResetToken(token);
  if (!userId) {
    res.status(400).json({ error: "Invalid or expired reset link. Please request a new one." });
    return;
  }

  await db.update(usersTable)
    .set({ passwordHash: hashPassword(password) })
    .where(eq(usersTable.id, userId));

  logger.info({ userId }, "Password reset completed");
  res.json({ message: "Password updated successfully. You can now sign in." });
});

export default router;
