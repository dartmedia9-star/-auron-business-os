import { pgTable, text, serial, timestamp, integer, numeric, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { eventsTable } from "./events";

export const operatingExpensesTable = pgTable("operating_expenses", {
  id: serial("id").primaryKey(),
  category: text("category").notNull(),
  description: text("description").notNull(),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull().default("0"),
  gst: numeric("gst", { precision: 15, scale: 2 }).notNull().default("0"),
  year: integer("year").notNull(),
  month: integer("month").notNull(),
  date: date("date", { mode: "string" }),
  referenceNumber: text("reference_number"),
  eventId: integer("event_id").references(() => eventsTable.id, { onDelete: "set null" }),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertOperatingExpenseSchema = createInsertSchema(operatingExpensesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOperatingExpense = z.infer<typeof insertOperatingExpenseSchema>;
export type OperatingExpense = typeof operatingExpensesTable.$inferSelect;
