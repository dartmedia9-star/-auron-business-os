import { pgTable, text, serial, timestamp, numeric, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const fundAccountsTable = pgTable("fund_accounts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  opening_balance: numeric("opening_balance", { precision: 15, scale: 2 }).notNull().default("0"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertFundAccountSchema = createInsertSchema(fundAccountsTable).omit({ id: true, created_at: true, updated_at: true });
export type InsertFundAccount = z.infer<typeof insertFundAccountSchema>;
export type FundAccount = typeof fundAccountsTable.$inferSelect;