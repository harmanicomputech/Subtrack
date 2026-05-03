import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, cancellationRequestsTable, subscriptionsTable, savingsTable } from "@workspace/db";
import {
  CreateCancellationBody,
  GetCancellationParams,
  UpdateCancellationParams,
  UpdateCancellationBody,
} from "@workspace/api-zod";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();

function formatCancellation(c: typeof cancellationRequestsTable.$inferSelect) {
  return {
    id: c.id,
    userId: c.userId,
    subscriptionId: c.subscriptionId,
    subscriptionName: c.subscriptionName,
    method: c.method,
    status: c.status,
    notes: c.notes ?? null,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

router.get("/cancellations", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const cancellations = await db
    .select()
    .from(cancellationRequestsTable)
    .where(eq(cancellationRequestsTable.userId, req.userId!));

  res.json(cancellations.map(formatCancellation));
});

router.post("/cancellations", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const parsed = CreateCancellationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [sub] = await db
    .select()
    .from(subscriptionsTable)
    .where(and(eq(subscriptionsTable.id, parsed.data.subscriptionId), eq(subscriptionsTable.userId, req.userId!)))
    .limit(1);

  if (!sub) {
    res.status(404).json({ error: "Subscription not found" });
    return;
  }

  const [cancellation] = await db.insert(cancellationRequestsTable).values({
    userId: req.userId!,
    subscriptionId: parsed.data.subscriptionId,
    subscriptionName: sub.merchantName,
    method: parsed.data.method,
    status: "pending",
    notes: parsed.data.notes ?? null,
  }).returning();

  // Mark subscription as cancelled
  await db
    .update(subscriptionsTable)
    .set({ status: "cancelled" })
    .where(eq(subscriptionsTable.id, parsed.data.subscriptionId));

  // Record savings
  await db.insert(savingsTable).values({
    userId: req.userId!,
    subscriptionId: parsed.data.subscriptionId,
    subscriptionName: sub.merchantName,
    amountSaved: sub.amount,
    currency: sub.currency,
  });

  res.status(201).json(formatCancellation(cancellation));
});

router.get("/cancellations/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = GetCancellationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [cancellation] = await db
    .select()
    .from(cancellationRequestsTable)
    .where(and(eq(cancellationRequestsTable.id, params.data.id), eq(cancellationRequestsTable.userId, req.userId!)))
    .limit(1);

  if (!cancellation) {
    res.status(404).json({ error: "Cancellation request not found" });
    return;
  }

  res.json(formatCancellation(cancellation));
});

router.patch("/cancellations/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const params = UpdateCancellationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = UpdateCancellationBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const updates: Record<string, unknown> = {};
  if (body.data.status != null) updates.status = body.data.status;
  if (body.data.notes != null) updates.notes = body.data.notes;

  const [cancellation] = await db
    .update(cancellationRequestsTable)
    .set(updates)
    .where(and(eq(cancellationRequestsTable.id, params.data.id), eq(cancellationRequestsTable.userId, req.userId!)))
    .returning();

  if (!cancellation) {
    res.status(404).json({ error: "Cancellation not found" });
    return;
  }

  res.json(formatCancellation(cancellation));
});

export default router;
