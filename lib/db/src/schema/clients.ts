import { pgTable, text, serial, timestamp, boolean, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const clientsTable = pgTable("clients", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  company: text("company"),
  contactPerson: text("contact_person"),
  phone: text("phone"),
  email: text("email"),
  location: text("location"),
  clientType: text("client_type").notNull().default("Corporate"),
  industry: text("industry"),
  leadSource: text("lead_source"),
  notes: text("notes"),
  isDemo: boolean("is_demo").notNull().default(false),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertClientSchema = createInsertSchema(clientsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertClient = z.infer<typeof insertClientSchema>;
export type Client = typeof clientsTable.$inferSelect;
