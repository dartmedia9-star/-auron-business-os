import { pgTable, text, serial, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";

// Reusable custom objects made in the Event Design Studio's Custom Builder
// (migration 0008). `definition` is the structured construction recipe
// (drawing, construction method, parts and the generated recipe placed into
// projects), validated on every write against lib/design-model. Projects
// keep their own copy when an object is placed, so editing or deleting a
// library entry never changes a saved design. Nothing here is a financial
// record.

export const designCustomObjectsTable = pgTable(
  "design_custom_objects",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    category: text("category").notNull().default("Other"),
    description: text("description"),
    definition: jsonb("definition").notNull(),
    schemaVersion: integer("schema_version").notNull(),
    revision: integer("revision").notNull().default(1),
    createdBy: text("created_by"),
    updatedBy: text("updated_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("design_custom_objects_updated_at_idx").on(t.updatedAt)],
);

export type DesignCustomObjectRow = typeof designCustomObjectsTable.$inferSelect;
