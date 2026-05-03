import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, savingsTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/savings", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const savings = await db
    .select()
    .from(savingsTable)
    .where(eq(savingsTable.userId, req.userId!));

  res.json(savings.map((s) => ({
    id: s.id,
    userId: s.userId,
    subscriptionId: s.subscriptionId,
    subscriptionName: s.subscriptionName,
    amountSaved: Number(s.amountSaved),
    currency: s.currency,
    savedAt: s.savedAt.toISOString(),
  })));
});

export default router;
