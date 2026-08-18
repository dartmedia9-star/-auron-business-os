import { pgTable, text, serial, timestamp, integer, numeric, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { eventsTable } from "./events";

export const eventCostsTable = pgTable("event_costs", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").notNull().references(() => eventsTable.id, { onDelete: "cascade" }),
  vendorId: integer("vendor_id"),
  category: text("category").notNull(),
  description: text("description"),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull().default("0"),
  gst: numeric("gst", { precision: 15, scale: 2 }).notNull().default("0"),
  totalAmount: numeric("total_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  paymentStatus: text("payment_status").notNull().default("pending"),
  date: date("date", { mode: "string" }),
  referenceNumber: text("reference_number"),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertEventCostSchema = createInsertSchema(eventCostsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEventCost = z.infer<typeof insertEventCostSchema>;
export type EventCost = typeof eventCostsTable.$inferSelect;
