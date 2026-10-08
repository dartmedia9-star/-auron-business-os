import { pgTable, text, serial, timestamp, integer, numeric, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientPaymentsTable } from "./client-payments";
import { eventsTable } from "./events";

export const paymentAllocationsTable = pgTable("payment_allocations", {
  id: serial("id").primaryKey(),
  paymentId: integer("payment_id").notNull().references(() => clientPaymentsTable.id, { onDelete: "cascade" }),
  eventId: integer("event_id").notNull().references(() => eventsTable.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("payment_allocations_payment_event_idx").on(table.paymentId, table.eventId),
]);

export const insertPaymentAllocationSchema = createInsertSchema(paymentAllocationsTable).omit({ id: true, createdAt: true });
export type InsertPaymentAllocation = z.infer<typeof insertPaymentAllocationSchema>;
export type PaymentAllocation = typeof paymentAllocationsTable.$inferSelect;
