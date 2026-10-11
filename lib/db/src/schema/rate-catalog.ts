import { pgTable, text, serial, timestamp, numeric, boolean, integer, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Rate Calculator master catalog (migration 0006). Internal reference rates
// only: nothing here is revenue, cost, a receivable or a quotation, and no
// row is ever seeded; every category and item is created by a user.

export const rateCategoriesTable = pgTable(
  "rate_categories",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdBy: text("created_by"),
    updatedBy: text("updated_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("rate_categories_name_lower_idx").on(sql`lower(btrim(${t.name}))`)],
);

export const rateItemsTable = pgTable(
  "rate_items",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    categoryId: integer("category_id").notNull().references(() => rateCategoriesTable.id),
    subcategory: text("subcategory"),
    description: text("description"),
    aliases: text("aliases").array().notNull().default(sql`'{}'::text[]`),
    /** Unit rate, or the percentage for pricing_method = 'percentage'. NULL = not configured yet. */
    rate: numeric("rate", { precision: 14, scale: 2 }),
    /** per_sqft | per_sqm | per_rft | per_rmt | per_unit | fixed | percentage */
    pricingMethod: text("pricing_method").notNull(),
    /** Unit name for per_unit items, e.g. "piece", "chair", "day". */
    unitLabel: text("unit_label"),
    /** manual | selected_items | all_other_items (percentage items only). */
    percentageBase: text("percentage_base"),
    percentageBaseItemIds: integer("percentage_base_item_ids").array().notNull().default(sql`'{}'::integer[]`),
    defaultLength: numeric("default_length", { precision: 14, scale: 4 }),
    defaultWidth: numeric("default_width", { precision: 14, scale: 4 }),
    defaultQuantity: numeric("default_quantity", { precision: 14, scale: 4 }),
    /** ft | m */
    defaultDimensionUnit: text("default_dimension_unit"),
    minBillable: numeric("min_billable", { precision: 14, scale: 4 }),
    maxBillable: numeric("max_billable", { precision: 14, scale: 4 }),
    conditions: text("conditions"),
    notes: text("notes"),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: text("created_by"),
    updatedBy: text("updated_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    index("rate_items_category_id_idx").on(t.categoryId),
    uniqueIndex("rate_items_category_name_lower_idx").on(t.categoryId, sql`lower(btrim(${t.name}))`),
  ],
);

export const rateItemRelationsTable = pgTable(
  "rate_item_relations",
  {
    id: serial("id").primaryKey(),
    itemId: integer("item_id").notNull().references(() => rateItemsTable.id),
    relatedItemId: integer("related_item_id").notNull().references(() => rateItemsTable.id),
    /** includes | conflicts | requires | addon */
    relationType: text("relation_type").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("rate_item_relations_item_id_idx").on(t.itemId),
    uniqueIndex("rate_item_relations_unique_idx").on(t.itemId, t.relatedItemId, t.relationType),
  ],
);

export type RateCategory = typeof rateCategoriesTable.$inferSelect;
export type RateItem = typeof rateItemsTable.$inferSelect;
export type RateItemRelation = typeof rateItemRelationsTable.$inferSelect;
