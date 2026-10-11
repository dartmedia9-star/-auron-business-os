-- 0006: Rate Calculator master catalog
--
-- Additive and production-safe:
--   * creates THREE new tables (rate_categories, rate_items,
--     rate_item_relations) and their indexes; alters, drops and rewrites
--     nothing that already exists
--   * inserts NO rows: the catalog starts empty and every category and item
--     is created by a user in the app
--   * touches no financial table: rate items are internal reference rates,
--     never revenue, costs, receivables, fund transactions or quotations
--   * idempotent (IF NOT EXISTS) and runs in one transaction; any error rolls
--     everything back
--
-- Apply manually (production has no __drizzle_migrations table):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f lib/db/migrations/0006_rate_calculator.sql

BEGIN;

CREATE TABLE IF NOT EXISTS "rate_categories" (
  "id" serial PRIMARY KEY,
  "name" text NOT NULL,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_by" text,
  "updated_by" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "rate_categories_name_lower_idx"
  ON "rate_categories" USING btree (lower(btrim("name")));

CREATE TABLE IF NOT EXISTS "rate_items" (
  "id" serial PRIMARY KEY,
  "name" text NOT NULL,
  "category_id" integer NOT NULL,
  "subcategory" text,
  "description" text,
  "aliases" text[] NOT NULL DEFAULT '{}'::text[],
  "rate" numeric(14, 2),
  "pricing_method" text NOT NULL,
  "unit_label" text,
  "percentage_base" text,
  "percentage_base_item_ids" integer[] NOT NULL DEFAULT '{}'::integer[],
  "default_length" numeric(14, 4),
  "default_width" numeric(14, 4),
  "default_quantity" numeric(14, 4),
  "default_dimension_unit" text,
  "min_billable" numeric(14, 4),
  "max_billable" numeric(14, 4),
  "conditions" text,
  "notes" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_by" text,
  "updated_by" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "rate_items_category_id_rate_categories_id_fk"
    FOREIGN KEY ("category_id") REFERENCES "rate_categories"("id"),
  CONSTRAINT "rate_items_pricing_method_check"
    CHECK ("pricing_method" IN ('per_sqft', 'per_sqm', 'per_rft', 'per_rmt', 'per_unit', 'fixed', 'percentage')),
  CONSTRAINT "rate_items_percentage_base_check"
    CHECK ("percentage_base" IS NULL OR "percentage_base" IN ('manual', 'selected_items', 'all_other_items')),
  CONSTRAINT "rate_items_dimension_unit_check"
    CHECK ("default_dimension_unit" IS NULL OR "default_dimension_unit" IN ('ft', 'm')),
  CONSTRAINT "rate_items_rate_check" CHECK ("rate" IS NULL OR "rate" >= 0)
);

CREATE INDEX IF NOT EXISTS "rate_items_category_id_idx"
  ON "rate_items" USING btree ("category_id");

CREATE UNIQUE INDEX IF NOT EXISTS "rate_items_category_name_lower_idx"
  ON "rate_items" USING btree ("category_id", lower(btrim("name")));

CREATE TABLE IF NOT EXISTS "rate_item_relations" (
  "id" serial PRIMARY KEY,
  "item_id" integer NOT NULL,
  "related_item_id" integer NOT NULL,
  "relation_type" text NOT NULL,
  "note" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "rate_item_relations_item_id_rate_items_id_fk"
    FOREIGN KEY ("item_id") REFERENCES "rate_items"("id"),
  CONSTRAINT "rate_item_relations_related_item_id_rate_items_id_fk"
    FOREIGN KEY ("related_item_id") REFERENCES "rate_items"("id"),
  CONSTRAINT "rate_item_relations_type_check"
    CHECK ("relation_type" IN ('includes', 'conflicts', 'requires', 'addon')),
  CONSTRAINT "rate_item_relations_not_self_check" CHECK ("item_id" <> "related_item_id")
);

CREATE INDEX IF NOT EXISTS "rate_item_relations_item_id_idx"
  ON "rate_item_relations" USING btree ("item_id");

CREATE UNIQUE INDEX IF NOT EXISTS "rate_item_relations_unique_idx"
  ON "rate_item_relations" USING btree ("item_id", "related_item_id", "relation_type");

COMMIT;
