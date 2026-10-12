-- 0007: Event Design Studio projects
--
-- Additive and production-safe:
--   * creates ONE new table (design_projects) and one index; alters, drops
--     and rewrites nothing that already exists
--   * inserts NO rows
--   * touches no financial table; the optional client_id / event_id links
--     are ON DELETE SET NULL, so deleting a client or event never fails or
--     deletes a design
--   * idempotent (IF NOT EXISTS) and runs in one transaction; any error rolls
--     everything back
--
-- Apply manually (production has no __drizzle_migrations table):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f lib/db/migrations/0007_design_projects.sql

BEGIN;

CREATE TABLE IF NOT EXISTS "design_projects" (
  "id" serial PRIMARY KEY,
  "name" text NOT NULL,
  "venue_name" text,
  "client_id" integer,
  "client_name" text,
  "event_id" integer,
  "model" jsonb NOT NULL,
  "schema_version" integer NOT NULL,
  "revision" integer NOT NULL DEFAULT 1,
  "created_by" text,
  "updated_by" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "design_projects_client_id_clients_id_fk"
    FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL,
  CONSTRAINT "design_projects_event_id_events_id_fk"
    FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL,
  CONSTRAINT "design_projects_name_not_blank" CHECK (btrim("name") <> ''),
  CONSTRAINT "design_projects_revision_positive" CHECK ("revision" > 0),
  CONSTRAINT "design_projects_model_object" CHECK (jsonb_typeof("model") = 'object')
);

CREATE INDEX IF NOT EXISTS "design_projects_updated_at_idx"
  ON "design_projects" USING btree ("updated_at");

COMMIT;
