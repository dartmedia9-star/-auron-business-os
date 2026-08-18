import { pgTable, text, serial, timestamp, boolean, integer, numeric, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const assetsTable = pgTable("assets", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  purchaseDate: date("purchase_date", { mode: "string" }).notNull(),
  purchaseCost: numeric("purchase_cost", { precision: 15, scale: 2 }).notNull().default("0"),
  currentBookValue: numeric("current_book_value", { precision: 15, scale: 2 }),
  storageLocation: text("storage_location"),
  condition: text("condition").notNull().default("good"),
  maintenanceCost: numeric("maintenance_cost", { precision: 15, scale: 2 }).notNull().default("0"),
  rentalValue: numeric("rental_value", { precision: 15, scale: 2 }),
  notes: text("notes"),
  isDemo: boolean("is_demo").notNull().default(false),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertAssetSchema = createInsertSchema(assetsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAsset = z.infer<typeof insertAssetSchema>;
export type Asset = typeof assetsTable.$inferSelect;
