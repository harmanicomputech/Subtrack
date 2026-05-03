import { pgTable, text, serial, integer, numeric, boolean, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { bankConnectionsTable } from "./bankConnections";

export const transactionsTable = pgTable("transactions", {
  id: serial("id").primaryKey(),
  bankConnectionId: integer("bank_connection_id").notNull().references(() => bankConnectionsTable.id, { onDelete: "cascade" }),
  merchantName: text("merchant_name").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("GBP"),
  transactionDate: timestamp("transaction_date", { withTimezone: true }).notNull(),
  category: text("category"),
  isSubscription: boolean("is_subscription").notNull().default(false),
  // Provider-assigned transaction ID — used for deduplication on re-sync.
  // Unique per (connection, externalId) so the same provider ID can exist
  // across different bank connections without conflicting.
  externalId: text("external_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("transactions_bank_connection_idx").on(t.bankConnectionId),
  index("transactions_date_idx").on(t.transactionDate),
  // Partial unique index: only enforce uniqueness when externalId is not null.
  // This prevents duplicate transactions on re-sync while allowing
  // manually-created transactions (which have no externalId) to coexist.
  uniqueIndex("transactions_connection_external_id_idx")
    .on(t.bankConnectionId, t.externalId)
    .where(sql`external_id IS NOT NULL`),
]);

export const insertTransactionSchema = createInsertSchema(transactionsTable).omit({ id: true, createdAt: true });
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactionsTable.$inferSelect;
