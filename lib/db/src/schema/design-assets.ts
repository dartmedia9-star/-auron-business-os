import { pgTable, text, serial, timestamp, integer, index, uniqueIndex, customType, primaryKey } from "drizzle-orm/pg-core";

// Event Design Studio image assets (migration 0009): designer artwork,
// reference drawings and images taken out of PDFs. Projects and custom
// objects refer to an asset by id; image bytes never go inside project JSON.
//
// The bytes live in Postgres (bytea, stored out of line without compression,
// since images are already compressed). List queries never select `data`, so
// browsing the gallery only reads metadata and the small thumbnail.
//
// Uploads arrive in pieces below Nginx's default 1 MB body limit
// (design_asset_uploads + design_asset_upload_chunks), are checked
// (piece hashes, total size, whole-file SHA-256, real image header and pixel
// limits) and assembled into one asset row in a transaction. Unfinished
// uploads expire and are removed. Nothing here is a financial record.

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

export const designAssetsTable = pgTable(
  "design_assets",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    /** "image" (an imported image file), "pdf-image" (embedded in a PDF), "pdf-page" (a rendered PDF page). */
    kind: text("kind").notNull(),
    mime: text("mime").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    byteSize: integer("byte_size").notNull(),
    sha256: text("sha256").notNull(),
    data: bytea("data").notNull(),
    thumb: bytea("thumb"),
    thumbMime: text("thumb_mime"),
    sourceName: text("source_name"),
    sourcePage: integer("source_page"),
    createdBy: text("created_by"),
    updatedBy: text("updated_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("design_assets_sha256_idx").on(t.sha256), index("design_assets_created_at_idx").on(t.createdAt)],
);

export const designAssetUploadsTable = pgTable(
  "design_asset_uploads",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    kind: text("kind").notNull(),
    byteSize: integer("byte_size").notNull(),
    sha256: text("sha256").notNull(),
    chunkSize: integer("chunk_size").notNull(),
    chunkCount: integer("chunk_count").notNull(),
    sourceName: text("source_name"),
    sourcePage: integer("source_page"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("design_asset_uploads_expires_idx").on(t.expiresAt), index("design_asset_uploads_created_by_idx").on(t.createdBy)],
);

export const designAssetUploadChunksTable = pgTable(
  "design_asset_upload_chunks",
  {
    uploadId: text("upload_id")
      .notNull()
      .references(() => designAssetUploadsTable.id, { onDelete: "cascade" }),
    idx: integer("idx").notNull(),
    data: bytea("data").notNull(),
  },
  (t) => [primaryKey({ columns: [t.uploadId, t.idx] })],
);

export type DesignAssetRow = typeof designAssetsTable.$inferSelect;
export type DesignAssetUploadRow = typeof designAssetUploadsTable.$inferSelect;
