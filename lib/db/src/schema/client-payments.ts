import { sql } from "drizzle-orm";
import { pgTable, text, serial, timestamp, integer, numeric, date, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";
import { fundAccountsTable } from "./fundAccounts";

export const clientPaymentsTable = pgTable("client_payments", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clientsTable.id, { onDelete: "restrict" }),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  paymentDate: date("payment_date", { mode: "string" }).notNull(),
  fundAccountId: integer("fund_account_id").notNull().references(() => fundAccountsTable.id, { onDelete: "restrict" }),
  paymentMethod: text("payment_method"),
  reference: text("reference"),
  notes: text("notes"),
  // Client-generated key for one submission; a retried/double-clicked submit
  // with the same key returns the original payment. Added in migration 0005.
  idempotencyKey: text("idempotency_key"),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("client_payments_idempotency_key_idx").on(table.idempotencyKey).where(sql`${table.idempotencyKey} IS NOT NULL`),
]);

export const insertClientPaymentSchema = createInsertSchema(clientPaymentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertClientPayment = z.infer<typeof insertClientPaymentSchema>;
export type ClientPayment = typeof clientPaymentsTable.$inferSelect;
