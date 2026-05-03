import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const bankConnectionsTable = pgTable("bank_connections", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  // TrueLayer provider info
  provider: text("provider"),                        // e.g. "ob-monzo", "ob-hsbc"
  providerDisplayName: text("provider_display_name"), // e.g. "Monzo", "HSBC"
  bankName: text("bank_name").notNull(),
  bankLogo: text("bank_logo"),
  status: text("status").notNull().default("connected"),
  // Encrypted TrueLayer tokens (AES-256-GCM, never exposed to frontend)
  accessToken: text("access_token"),                 // encrypted
  refreshToken: text("refresh_token"),               // encrypted
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
  // TrueLayer connection ID (returned after consent)
  trueLayerConnectionId: text("truelayer_connection_id"),
  // Which TrueLayer environment this token was issued in: "sandbox" | "production"
  environment: text("environment").notNull().default("sandbox"),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertBankConnectionSchema = createInsertSchema(bankConnectionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBankConnection = z.infer<typeof insertBankConnectionSchema>;
export type BankConnection = typeof bankConnectionsTable.$inferSelect;
