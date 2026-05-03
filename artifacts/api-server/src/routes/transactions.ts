import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, transactionsTable, bankConnectionsTable } from "@workspace/db";
import { ListTransactionsQueryParams } from "@workspace/api-zod";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/transactions", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const parsed = ListTransactionsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { limit = 50, offset = 0 } = parsed.data;

  // Get all bank connections for this user to filter transactions
  const userConnections = await db
    .select({ id: bankConnectionsTable.id })
    .from(bankConnectionsTable)
    .where(eq(bankConnectionsTable.userId, req.userId!));

  const connectionIds = userConnections.map((c) => c.id);

  if (connectionIds.length === 0) {
    res.json([]);
    return;
  }

  const limitNum = typeof limit === "number" ? limit : Number(limit) || 50;
  const offsetNum = typeof offset === "number" ? offset : Number(offset) || 0;

  let query = db
    .select()
    .from(transactionsTable)
    .orderBy(desc(transactionsTable.transactionDate));

  const allTxns = await query;
  const filtered = allTxns
    .filter((t) => connectionIds.includes(t.bankConnectionId))
    .slice(offsetNum, offsetNum + limitNum);

  res.json(filtered.map((t) => ({
    id: t.id,
    bankConnectionId: t.bankConnectionId,
    merchantName: t.merchantName,
    amount: Number(t.amount),
    currency: t.currency,
    transactionDate: t.transactionDate.toISOString(),
    category: t.category ?? null,
    isSubscription: t.isSubscription,
    createdAt: t.createdAt.toISOString(),
  })));
});

export default router;
