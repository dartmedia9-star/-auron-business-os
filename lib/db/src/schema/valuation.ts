import { pgTable, text, serial, timestamp, boolean, numeric, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const valuationScenariosTable = pgTable("valuation_scenarios", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  scenarioType: text("scenario_type").notNull().default("custom"),
  targetValuation: numeric("target_valuation", { precision: 18, scale: 2 }).notNull().default("900000000"),
  currentRevenue: numeric("current_revenue", { precision: 15, scale: 2 }).notNull().default("0"),
  currentEbitda: numeric("current_ebitda", { precision: 15, scale: 2 }),
  currentNetProfit: numeric("current_net_profit", { precision: 15, scale: 2 }),
  revenueGrowthRate: numeric("revenue_growth_rate", { precision: 8, scale: 4 }).notNull().default("0.20"),
  ebitdaMargin: numeric("ebitda_margin", { precision: 8, scale: 4 }).notNull().default("0.15"),
  revenueMultiple: numeric("revenue_multiple", { precision: 8, scale: 2 }).notNull().default("3"),
  ebitdaMultiple: numeric("ebitda_multiple", { precision: 8, scale: 2 }).notNull().default("10"),
  notes: text("notes"),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertValuationScenarioSchema = createInsertSchema(valuationScenariosTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertValuationScenario = z.infer<typeof insertValuationScenarioSchema>;
export type ValuationScenario = typeof valuationScenariosTable.$inferSelect;
