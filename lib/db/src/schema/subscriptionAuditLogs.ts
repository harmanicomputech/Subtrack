import { pgTable, serial, integer, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { subscriptionsTable } from "./subscriptions";

export const subscriptionAuditLogsTable = pgTable("subscription_audit_logs", {
  id: serial("id").primaryKey(),
  subscriptionId: integer("subscription_id")
    .notNull()
    .references(() => subscriptionsTable.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(),
  source: text("source").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SubscriptionAuditLog = typeof subscriptionAuditLogsTable.$inferSelect;
