import { pgTable, text, serial, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { subscriptionsTable } from "./subscriptions";

export const savingsTable = pgTable("savings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  subscriptionId: integer("subscription_id").notNull().references(() => subscriptionsTable.id, { onDelete: "cascade" }),
  subscriptionName: text("subscription_name").notNull(),
  amountSaved: numeric("amount_saved", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("GBP"),
  savedAt: timestamp("saved_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSavingsSchema = createInsertSchema(savingsTable).omit({ id: true, createdAt: true });
export type InsertSavings = z.infer<typeof insertSavingsSchema>;
export type Savings = typeof savingsTable.$inferSelect;
