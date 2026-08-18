import { pgTable, text, serial, timestamp, boolean, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const marketingChannelsTable = pgTable("marketing_channels", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const marketingSpendTable = pgTable("marketing_spend", {
  id: serial("id").primaryKey(),
  channelId: integer("channel_id").notNull().references(() => marketingChannelsTable.id),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull().default("0"),
  leadsGenerated: integer("leads_generated").notNull().default(0),
  qualifiedLeads: integer("qualified_leads").notNull().default(0),
  customersAcquired: integer("customers_acquired").notNull().default(0),
  revenueGenerated: numeric("revenue_generated", { precision: 15, scale: 2 }).notNull().default("0"),
  grossProfitGenerated: numeric("gross_profit_generated", { precision: 15, scale: 2 }).notNull().default("0"),
  year: integer("year").notNull(),
  month: integer("month").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertMarketingChannelSchema = createInsertSchema(marketingChannelsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMarketingChannel = z.infer<typeof insertMarketingChannelSchema>;
export type MarketingChannel = typeof marketingChannelsTable.$inferSelect;

export const insertMarketingSpendSchema = createInsertSchema(marketingSpendTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMarketingSpend = z.infer<typeof insertMarketingSpendSchema>;
export type MarketingSpend = typeof marketingSpendTable.$inferSelect;
