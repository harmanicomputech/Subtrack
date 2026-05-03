import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { subscriptionsTable } from "./subscriptions";

export const cancellationRequestsTable = pgTable("cancellation_requests", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  subscriptionId: integer("subscription_id").notNull().references(() => subscriptionsTable.id, { onDelete: "cascade" }),
  subscriptionName: text("subscription_name").notNull(),
  method: text("method").notNull().default("email"),
  status: text("status").notNull().default("pending"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCancellationRequestSchema = createInsertSchema(cancellationRequestsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCancellationRequest = z.infer<typeof insertCancellationRequestSchema>;
export type CancellationRequest = typeof cancellationRequestsTable.$inferSelect;
