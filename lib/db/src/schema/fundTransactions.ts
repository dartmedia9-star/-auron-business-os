import { pgTable, text, serial, timestamp, numeric, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { fundAccountsTable } from "./fundAccounts";
import { fundTransfersTable } from "./fundTransfers";
import { operatingExpensesTable } from "./finance";

export const fundTransactionsTable = pgTable("fund_transactions", {
  id: serial("id").primaryKey(),
  fund_account_id: integer("fund_account_id").notNull().references(() => fundAccountsTable.id, { onDelete: "restrict" }),
  transaction_type: text("transaction_type").notNull(), // expense | expense_reversal | transfer_in | transfer_out | adjustment
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  description: text("description"),
  related_expense_id: integer("related_expense_id").references(() => operatingExpensesTable.id, { onDelete: "set null" }),
  related_transfer_id: integer("related_transfer_id").references(() => fundTransfersTable.id, { onDelete: "set null" }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  created_by: text("created_by"),
});

export const insertFundTransactionSchema = createInsertSchema(fundTransactionsTable).omit({ id: true, created_at: true });
export type InsertFundTransaction = z.infer<typeof insertFundTransactionSchema>;
export type FundTransaction = typeof fundTransactionsTable.$inferSelect;