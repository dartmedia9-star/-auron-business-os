import { pgTable, text, serial, timestamp, integer, numeric, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { eventsTable } from "./events";

export const eventRevenueTable = pgTable("event_revenue", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").notNull().references(() => eventsTable.id, { onDelete: "cascade" }).unique(),
  contractValue: numeric("contract_value", { precision: 15, scale: 2 }).notNull().default("0"),
  discount: numeric("discount", { precision: 15, scale: 2 }).notNull().default("0"),
  gst: numeric("gst", { precision: 15, scale: 2 }).notNull().default("0"),
  totalInvoiceValue: numeric("total_invoice_value", { precision: 15, scale: 2 }).notNull().default("0"),
  netRevenue: numeric("net_revenue", { precision: 15, scale: 2 }).notNull().default("0"),
  advanceReceived: numeric("advance_received", { precision: 15, scale: 2 }).notNull().default("0"),
  secondPayment: numeric("second_payment", { precision: 15, scale: 2 }).notNull().default("0"),
  finalPayment: numeric("final_payment", { precision: 15, scale: 2 }).notNull().default("0"),
  totalCollected: numeric("total_collected", { precision: 15, scale: 2 }).notNull().default("0"),
  outstandingAmount: numeric("outstanding_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  paymentStatus: text("payment_status").notNull().default("pending"),
  invoiceNumber: text("invoice_number"),
  dueDate: date("due_date", { mode: "string" }),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertEventRevenueSchema = createInsertSchema(eventRevenueTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEventRevenue = z.infer<typeof insertEventRevenueSchema>;
export type EventRevenue = typeof eventRevenueTable.$inferSelect;
