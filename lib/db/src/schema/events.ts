import { pgTable, text, serial, timestamp, boolean, integer, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";

export const eventsTable = pgTable("events", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  clientId: integer("client_id").notNull().references(() => clientsTable.id),
  eventType: text("event_type").notNull(),
  status: text("status").notNull().default("upcoming"),
  eventDate: date("event_date", { mode: "string" }).notNull(),
  venue: text("venue"),
  location: text("location"),
  salespersonId: integer("salesperson_id"),
  operationsManagerId: integer("operations_manager_id"),
  leadSource: text("lead_source"),
  notes: text("notes"),
  isDemo: boolean("is_demo").notNull().default(false),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertEventSchema = createInsertSchema(eventsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEvent = z.infer<typeof insertEventSchema>;
export type Event = typeof eventsTable.$inferSelect;
