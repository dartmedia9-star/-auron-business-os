-- 0008: Event Design Studio custom object library
--
-- Additive and production-safe:
--   * creates ONE new table (design_custom_objects) and one index; alters,
--     drops and rewrites nothing that already exists
--   * inserts NO rows
--   * no foreign keys: projects keep their own copy of a placed custom
--     object, so a library entry can be deleted without touching any design
--   * touches no financial table
--   * idempotent (IF NOT EXISTS) and runs in one transaction; any error rolls
--     everything back
--
-- Apply manually (production has no __drizzle_migrations table):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f lib/db/migrations/0008_design_custom_objects.sql
--
-- Rollback (only if no custom objects worth keeping have been saved; this
-- deletes them): DROP TABLE IF EXISTS "design_custom_objects";
-- Projects that already contain placed custom objects keep working without
-- the table, because each placed object carries its own recipe.

BEGIN;

CREATE TABLE IF NOT EXISTS "design_custom_objects" (
  "id" serial PRIMARY KEY,
  "name" text NOT NULL,
  "category" text NOT NULL DEFAULT 'Other',
  "description" text,
  "definition" jsonb NOT NULL,
  "schema_version" integer NOT NULL,
  "revision" integer NOT NULL DEFAULT 1,
  "created_by" text,
  "updated_by" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "design_custom_objects_name_not_blank" CHECK (btrim("name") <> ''),
  CONSTRAINT "design_custom_objects_revision_positive" CHECK ("revision" > 0),
  CONSTRAINT "design_custom_objects_definition_object" CHECK (jsonb_typeof("definition") = 'object')
);

CREATE INDEX IF NOT EXISTS "design_custom_objects_updated_at_idx"
  ON "design_custom_objects" USING btree ("updated_at");

COMMIT;
