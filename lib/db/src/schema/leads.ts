import { pgTable, text, serial, timestamp, boolean, integer, numeric, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const leadsTable = pgTable("leads", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id"),
  contactName: text("contact_name").notNull(),
  contactPhone: text("contact_phone"),
  contactEmail: text("contact_email"),
  source: text("source"),
  eventType: text("event_type"),
  expectedValue: numeric("expected_value", { precision: 15, scale: 2 }),
  expectedProfit: numeric("expected_profit", { precision: 15, scale: 2 }),
  probability: integer("probability"),
  salespersonId: integer("salesperson_id"),
  dateReceived: date("date_received", { mode: "string" }),
  followUpDate: date("follow_up_date", { mode: "string" }),
  status: text("status").notNull().default("new"),
  lostReason: text("lost_reason"),
  notes: text("notes"),
  isDemo: boolean("is_demo").notNull().default(false),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertLeadSchema = createInsertSchema(leadsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLead = z.infer<typeof insertLeadSchema>;
export type Lead = typeof leadsTable.$inferSelect;
