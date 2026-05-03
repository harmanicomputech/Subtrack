import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { syncGmail } from "../lib/gmailSync";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Check Gmail connection status for current user
router.get("/gmail/status", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);

  res.json({
    connected: !!(user?.googleId && user?.googleAccessToken),
    googleId: user?.googleId ?? null,
    email: user?.email ?? null,
    gmailLastSyncAt: user?.gmailLastSyncAt?.toISOString() ?? null,
  });
});

// Trigger Gmail scan for current user
router.post("/gmail/sync", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);

  if (!user?.googleAccessToken) {
    res.status(400).json({
      error: "Gmail not connected. Please connect your Google account first.",
      connectUrl: `/api/auth/google`,
    });
    return;
  }

  try {
    const result = await syncGmail(req.userId!);
    res.json(result);
  } catch (err: unknown) {
    logger.error(err, "Gmail sync failed");
    const message = err instanceof Error ? err.message : "Gmail sync failed";

    // If token is expired, prompt re-auth
    if (message.includes("401") || message.includes("invalid_grant")) {
      res.status(401).json({
        error: "Gmail access token expired. Please reconnect your Google account.",
        connectUrl: `/api/auth/google`,
      });
      return;
    }

    res.status(500).json({ error: message });
  }
});

export default router;
