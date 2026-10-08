import { sql } from "drizzle-orm";
import { pgTable, text, serial, timestamp, numeric, integer, date, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { fundAccountsTable } from "./fundAccounts";
import { fundTransfersTable } from "./fundTransfers";
import { operatingExpensesTable } from "./finance";

export const fundTransactionsTable = pgTable("fund_transactions", {
  id: serial("id").primaryKey(),
  fund_account_id: integer("fund_account_id").notNull().references(() => fundAccountsTable.id, { onDelete: "restrict" }),
  transaction_type: text("transaction_type").notNull(), // expense | expense_reversal | transfer_in | transfer_out | client_payment | client_payment_reversal | adjustment
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  // Effective business date of the cash movement (payment date, expense date,
  // transfer date). Reporting buckets by this, never by created_at. Added in
  // migration 0004; historical rows were backfilled from their source record.
  transaction_date: date("transaction_date", { mode: "string" }).notNull().default(sql`CURRENT_DATE`),
  description: text("description"),
  related_expense_id: integer("related_expense_id").references(() => operatingExpensesTable.id, { onDelete: "set null" }),
  related_transfer_id: integer("related_transfer_id").references(() => fundTransfersTable.id, { onDelete: "set null" }),
  // Client payment this row belongs to (client_payment / client_payment_reversal).
  // No foreign key on purpose: reversal rows of a deleted payment keep the id so
  // its audit trail stays reachable. Added in migration 0005.
  related_client_payment_id: integer("related_client_payment_id"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  created_by: text("created_by"),
}, (table) => [
  index("fund_transactions_transaction_date_idx").on(table.transaction_date),
  index("fund_transactions_related_client_payment_id_idx").on(table.related_client_payment_id),
]);

export const insertFundTransactionSchema = createInsertSchema(fundTransactionsTable).omit({ id: true, created_at: true });
export type InsertFundTransaction = z.infer<typeof insertFundTransactionSchema>;
export type FundTransaction = typeof fundTransactionsTable.$inferSelect;