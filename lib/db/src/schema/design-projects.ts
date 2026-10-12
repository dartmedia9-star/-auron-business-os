import { pgTable, text, serial, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";
import { clientsTable } from "./clients";
import { eventsTable } from "./events";

// Event Design Studio projects (migration 0007). `model` holds the editable
// floor plan and 3D layout as structured JSON, validated on every write
// against the shared schema in lib/design-model. Nothing here is a financial
// record. `revision` increments on every save so a stale save from another
// tab or device is refused instead of overwriting newer work.

export const designProjectsTable = pgTable(
  "design_projects",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    venueName: text("venue_name"),
    clientId: integer("client_id").references(() => clientsTable.id, { onDelete: "set null" }),
    /** Free-text client when the project isn't linked to a client record. */
    clientName: text("client_name"),
    eventId: integer("event_id").references(() => eventsTable.id, { onDelete: "set null" }),
    model: jsonb("model").notNull(),
    schemaVersion: integer("schema_version").notNull(),
    revision: integer("revision").notNull().default(1),
    createdBy: text("created_by"),
    updatedBy: text("updated_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("design_projects_updated_at_idx").on(t.updatedAt)],
);

export type DesignProjectRow = typeof designProjectsTable.$inferSelect;
