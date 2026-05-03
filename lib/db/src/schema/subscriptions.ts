import { pgTable, text, serial, integer, numeric, timestamp, real, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { bankConnectionsTable } from "./bankConnections";

export const subscriptionsTable = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  bankConnectionId: integer("bank_connection_id").references(() => bankConnectionsTable.id, { onDelete: "set null" }),
  merchantName: text("merchant_name").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("GBP"),
  billingCycle: text("billing_cycle").notNull().default("monthly"),
  nextRenewalDate: timestamp("next_renewal_date", { withTimezone: true }),
  category: text("category"),
  status: text("status").notNull().default("active"),
  confidenceScore: real("confidence_score").notNull().default(1.0),
  // Primary source: bank | email | manual
  source: text("source").notNull().default("bank"),
  // All sources that have confirmed this subscription (JSON array e.g. ["bank","email"])
  sources: jsonb("sources").$type<string[]>().default(["bank"]),
  // Structured metadata from email detection (non-body data only)
  emailMetadata: jsonb("email_metadata"),
  // Timestamp of most recent detection event (bank sync or email scan)
  lastDetectedAt: timestamp("last_detected_at", { withTimezone: true }).defaultNow(),
  // Usage analysis: active | unused | trial | uncertain
  usageStatus: text("usage_status").notNull().default("active"),
  // 0–1 likelihood that this subscription is unused (higher = more likely unused)
  unusedScore: real("unused_score").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("subscriptions_user_idx").on(t.userId),
  index("subscriptions_status_idx").on(t.status),
  index("subscriptions_source_idx").on(t.source),
]);

export const insertSubscriptionSchema = createInsertSchema(subscriptionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type Subscription = typeof subscriptionsTable.$inferSelect;
