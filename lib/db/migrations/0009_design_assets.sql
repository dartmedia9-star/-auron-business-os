-- 0009: Event Design Studio image assets and chunked uploads
--
-- Additive and production-safe:
--   * creates THREE new tables (design_assets, design_asset_uploads,
--     design_asset_upload_chunks) and their indexes; alters, drops and
--     rewrites nothing that already exists
--   * inserts NO rows
--   * the only foreign key is chunk -> upload (ON DELETE CASCADE), so
--     removing an expired upload removes its pieces; nothing references
--     existing tables
--   * projects and custom objects refer to assets by id inside their JSON;
--     the API refuses to delete an asset that is still referenced
--   * touches no financial table
--   * idempotent (IF NOT EXISTS) and runs in one transaction; any error rolls
--     everything back
--
-- Image bytes are stored with STORAGE EXTERNAL: out of line, without trying
-- to compress already-compressed PNG/JPEG/WebP data.
--
-- Apply manually (production has no __drizzle_migrations table):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f lib/db/migrations/0009_design_assets.sql
--
-- Rollback (deletes every uploaded image; projects keep their geometry and
-- show "Missing image" where artwork was assigned):
--   DROP TABLE IF EXISTS "design_asset_upload_chunks";
--   DROP TABLE IF EXISTS "design_asset_uploads";
--   DROP TABLE IF EXISTS "design_assets";

BEGIN;

CREATE TABLE IF NOT EXISTS "design_assets" (
  "id" serial PRIMARY KEY,
  "name" text NOT NULL,
  "kind" text NOT NULL,
  "mime" text NOT NULL,
  "width" integer NOT NULL,
  "height" integer NOT NULL,
  "byte_size" integer NOT NULL,
  "sha256" text NOT NULL,
  "data" bytea NOT NULL,
  "thumb" bytea,
  "thumb_mime" text,
  "source_name" text,
  "source_page" integer,
  "created_by" text,
  "updated_by" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "design_assets_name_not_blank" CHECK (btrim("name") <> ''),
  CONSTRAINT "design_assets_kind_valid" CHECK ("kind" IN ('image', 'pdf-image', 'pdf-page')),
  CONSTRAINT "design_assets_mime_valid" CHECK ("mime" IN ('image/png', 'image/jpeg', 'image/webp')),
  CONSTRAINT "design_assets_size_positive" CHECK ("width" > 0 AND "height" > 0 AND "byte_size" > 0),
  CONSTRAINT "design_assets_sha256_format" CHECK ("sha256" ~ '^[0-9a-f]{64}$')
);
ALTER TABLE "design_assets" ALTER COLUMN "data" SET STORAGE EXTERNAL;
ALTER TABLE "design_assets" ALTER COLUMN "thumb" SET STORAGE EXTERNAL;
CREATE UNIQUE INDEX IF NOT EXISTS "design_assets_sha256_idx" ON "design_assets" USING btree ("sha256");
CREATE INDEX IF NOT EXISTS "design_assets_created_at_idx" ON "design_assets" USING btree ("created_at");

CREATE TABLE IF NOT EXISTS "design_asset_uploads" (
  "id" text PRIMARY KEY,
  "name" text NOT NULL,
  "kind" text NOT NULL,
  "byte_size" integer NOT NULL,
  "sha256" text NOT NULL,
  "chunk_size" integer NOT NULL,
  "chunk_count" integer NOT NULL,
  "source_name" text,
  "source_page" integer,
  "created_by" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "expires_at" timestamp with time zone NOT NULL,
  CONSTRAINT "design_asset_uploads_size_positive" CHECK ("byte_size" > 0 AND "chunk_size" > 0 AND "chunk_count" > 0)
);
CREATE INDEX IF NOT EXISTS "design_asset_uploads_expires_idx" ON "design_asset_uploads" USING btree ("expires_at");
CREATE INDEX IF NOT EXISTS "design_asset_uploads_created_by_idx" ON "design_asset_uploads" USING btree ("created_by");

CREATE TABLE IF NOT EXISTS "design_asset_upload_chunks" (
  "upload_id" text NOT NULL REFERENCES "design_asset_uploads" ("id") ON DELETE CASCADE,
  "idx" integer NOT NULL,
  "data" bytea NOT NULL,
  PRIMARY KEY ("upload_id", "idx")
);
ALTER TABLE "design_asset_upload_chunks" ALTER COLUMN "data" SET STORAGE EXTERNAL;

COMMIT;
