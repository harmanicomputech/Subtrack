import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, bankConnectionsTable } from "@workspace/db";
import {
  CreateBankConnectionBody,
  GetBankConnectionParams,
  DeleteBankConnectionParams,
} from "@workspace/api-zod";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();

// ── Shared response formatter ─────────────────────────────────────────────────
// All routes that return a BankConnection must use this to ensure consistent
// shape and inclusion of the `environment` field.

type DbBankConnection = typeof bankConnectionsTable.$inferSelect;

function formatConnection(c: DbBankConnection) {
  return {
    id: c.id,
    userId: c.userId,
    bankName: c.bankName,
    bankLogo: c.bankLogo ?? null,
    provider: c.provider ?? null,
    providerDisplayName: c.providerDisplayName ?? null,
    status: c.status,
    environment: c.environment ?? "sandbox",
    lastSyncedAt: c.lastSyncedAt?.toISOString() ?? null,
    tokenExpiresAt: c.tokenExpiresAt?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
  };
}

// ── GET /bank-connections ─────────────────────────────────────────────────────

router.get("/bank-connections", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const connections = await db
    .select()
    .from(bankConnectionsTable)
    .where(eq(bankConnectionsTable.userId, req.userId!));

  res.json(connections.map(formatConnection));
});

// ── POST /bank-connections ────────────────────────────────────────────────────
// Legacy manual-entry endpoint kept for backwards compatibility.
// Real TrueLayer connections are created via /api/bank/callback.

router.post("/bank-connections", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const parsed = CreateBankConnectionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [conn] = await db.insert(bankConnectionsTable).values({
    userId: req.userId!,
    bankName: parsed.data.bankName,
    bankLogo: parsed.data.bankLogo ?? null,
    status: "connected",
    environment: "sandbox",
  }).returning();

  res.status(201).json(formatConnection(conn));
});

// ── GET /bank-connections/:id ─────────────────────────────────────────────────

router.get("/bank-connections/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = GetBankConnectionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [conn] = await db
    .select()
    .from(bankConnectionsTable)
    .where(and(
      eq(bankConnectionsTable.id, params.data.id),
      eq(bankConnectionsTable.userId, req.userId!),
    ))
    .limit(1);

  if (!conn) {
    res.status(404).json({ error: "Bank connection not found" });
    return;
  }

  res.json(formatConnection(conn));
});

// ── DELETE /bank-connections/:id ──────────────────────────────────────────────

router.delete("/bank-connections/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = DeleteBankConnectionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [conn] = await db
    .delete(bankConnectionsTable)
    .where(and(
      eq(bankConnectionsTable.id, params.data.id),
      eq(bankConnectionsTable.userId, req.userId!),
    ))
    .returning();

  if (!conn) {
    res.status(404).json({ error: "Bank connection not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
