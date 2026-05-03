import { pgTable, text, serial, integer, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const VALID_BILLING_EVENT_TYPES = [
  "subscription_started",
  "subscription_cancelled",
  "billing_skipped",
  "upgrade_clicked",
  "upgrade_prompt_clicked",
  "subscription_page_viewed",
] as const;

export type BillingEventType = typeof VALID_BILLING_EVENT_TYPES[number];

export const billingEventsTable = pgTable(
  "billing_events",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    label: text("label"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("billing_events_user_id_idx").on(t.userId)],
);

export const insertBillingEventSchema = createInsertSchema(billingEventsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertBillingEvent = z.infer<typeof insertBillingEventSchema>;
export type BillingEventRow = typeof billingEventsTable.$inferSelect;
