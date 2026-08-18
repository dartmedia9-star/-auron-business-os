import { pgTable, text, serial, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const companySettingsTable = pgTable("company_settings", {
  id: serial("id").primaryKey(),
  companyName: text("company_name").notNull().default("Auron Event Productions"),
  country: text("country").notNull().default("India"),
  currency: text("currency").notNull().default("INR"),
  gstNumber: text("gst_number"),
  gstRate: numeric("gst_rate", { precision: 5, scale: 2 }).notNull().default("18"),
  excellentMarginThreshold: numeric("excellent_margin_threshold", { precision: 5, scale: 2 }).notNull().default("35"),
  healthyMarginThreshold: numeric("healthy_margin_threshold", { precision: 5, scale: 2 }).notNull().default("20"),
  warningMarginThreshold: numeric("warning_margin_threshold", { precision: 5, scale: 2 }).notNull().default("10"),
  ltvCacTarget: numeric("ltv_cac_target", { precision: 8, scale: 2 }).notNull().default("3"),
  cacTarget: numeric("cac_target", { precision: 15, scale: 2 }),
  valuationTarget: numeric("valuation_target", { precision: 18, scale: 2 }).notNull().default("900000000"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCompanySettingsSchema = createInsertSchema(companySettingsTable).omit({ id: true, updatedAt: true });
export type InsertCompanySettings = z.infer<typeof insertCompanySettingsSchema>;
export type CompanySettings = typeof companySettingsTable.$inferSelect;
