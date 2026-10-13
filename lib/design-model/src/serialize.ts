import { SCHEMA_VERSION, projectModelSchema, type ProjectModel } from "./schema";

// Reading and writing the model. Everything that enters the editor or the
// database goes through parseProjectModel: schema validation, defaults for
// optional fields, migration of older schema versions, and a referential
// check that ids are unique.

export type ParseModelResult = { ok: true; model: ProjectModel } | { ok: false; error: string };

type Migration = (input: Record<string, unknown>) => Record<string, unknown>;

/** Migrations from version N to N + 1, keyed by N. */
const MIGRATIONS: Record<number, Migration> = {
  // 1 → 2 only adds the optional `finishes` on objects: nothing to convert.
  1: (doc) => doc,
};

function migrate(input: Record<string, unknown>): Record<string, unknown> | string {
  let doc = input;
  let version = typeof doc.schemaVersion === "number" ? doc.schemaVersion : NaN;
  if (!Number.isInteger(version)) return "The design has no schema version";
  if (version > SCHEMA_VERSION) return `The design was saved by a newer version (schema ${version}); reload the app`;
  while (version < SCHEMA_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) return `No migration from schema version ${version}`;
    doc = { ...step(doc), schemaVersion: version + 1 };
    version += 1;
  }
  return doc;
}

export function parseProjectModel(input: unknown): ParseModelResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "The design data is not an object" };
  const migrated = migrate(input as Record<string, unknown>);
  if (typeof migrated === "string") return { ok: false, error: migrated };
  const parsed = projectModelSchema.safeParse(migrated);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first?.path.map(String).join(".") ?? "";
    return { ok: false, error: where ? `Invalid design data at ${where}: ${first.message}` : "Invalid design data" };
  }
  const model = parsed.data;
  const seen = new Set<string>();
  const lists = [model.rooms, model.partitions, model.openings, model.pillars, model.sections, model.objects, model.dimensions, model.labels, model.notes, model.checklist];
  for (const list of lists) {
    for (const e of list as Array<{ id: string }>) {
      if (seen.has(e.id)) return { ok: false, error: `Duplicate id ${e.id} in design data` };
      seen.add(e.id);
    }
  }
  for (const list of [model.rooms, model.partitions]) {
    for (const host of list) {
      const vs = new Set<string>();
      for (const p of host.points) {
        if (vs.has(p.id)) return { ok: false, error: `Duplicate vertex id ${p.id} in ${host.name}` };
        vs.add(p.id);
      }
    }
  }
  return { ok: true, model };
}

export function serializeProjectModel(model: ProjectModel): string {
  return JSON.stringify(model);
}

/** Entity counts for list views and logs. */
export function modelSummary(model: ProjectModel): { rooms: number; sections: number; objects: number; openings: number; pillars: number } {
  return { rooms: model.rooms.length, sections: model.sections.length, objects: model.objects.length, openings: model.openings.length, pillars: model.pillars.length };
}
