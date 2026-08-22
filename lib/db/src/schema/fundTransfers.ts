import { pgTable, text, serial, timestamp, numeric, integer, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { fundAccountsTable } from "./fundAccounts";

export const fundTransfersTable = pgTable("fund_transfers", {
  id: serial("id").primaryKey(),
  from_account_id: integer("from_account_id").notNull().references(() => fundAccountsTable.id, { onDelete: "restrict" }),
  to_account_id: integer("to_account_id").notNull().references(() => fundAccountsTable.id, { onDelete: "restrict" }),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  date: date("date", { mode: "string" }).notNull(),
  description: text("description"),
  created_by: text("created_by"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertFundTransferSchema = createInsertSchema(fundTransfersTable).omit({ id: true, created_at: true });
export type InsertFundTransfer = z.infer<typeof insertFundTransferSchema>;
export type FundTransfer = typeof fundTransfersTable.$inferSelect;