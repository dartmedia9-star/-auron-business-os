import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, designCustomObjectsTable, type DesignCustomObjectRow } from "@workspace/db";
import { CreateDesignObjectBody, DuplicateDesignObjectBody, UpdateDesignObjectBody } from "@workspace/api-zod";
import { parseCustomDefinition } from "@workspace/design-model";
import { loadUserNames } from "../lib/user-names";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Event Design Studio custom object library
//
// Reusable objects made in the Custom Builder. `definition` is the
// structured construction recipe (lib/design-model custom-schema.ts),
// validated on every write, never a picture or an opaque mesh. Placing an
// object copies its recipe into the project, so editing or deleting a
// library entry never changes a saved design.
//
// Writes carry the revision they started from (optimistic concurrency, like
// design projects). Visible to every signed-in user; nothing here touches a
// financial table or writes audit_logs.
// ---------------------------------------------------------------------------

const DEFINITION_VERSION = 1;

function parseId(value: unknown): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function authedUserId(req: Request, res: Response): string | null {
  if (req.isAuthenticated()) return req.user.id;
  res.status(401).json({ error: "Unauthorized" });
  return null;
}

function zodMessage(error: { issues: Array<{ path: PropertyKey[]; message: string }> }): string {
  const first = error.issues[0];
  if (!first) return "Invalid request";
  const field = first.path.map(String).join(".");
  return field ? `${field}: ${first.message}` : first.message;
}

const cleanText = (v: string | null | undefined): string | null => {
  const t = v?.trim();
  return t ? t : null;
};

async function toApi(rows: DesignCustomObjectRow[]) {
  const names = await loadUserNames(rows.flatMap((r) => [r.createdBy, r.updatedBy]));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category,
    description: r.description,
    definition: r.definition as Record<string, unknown>,
    revision: r.revision,
    schemaVersion: r.schemaVersion,
    createdByName: r.createdBy ? (names.get(r.createdBy) ?? null) : null,
    updatedByName: r.updatedBy ? (names.get(r.updatedBy) ?? null) : null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

router.get("/design-objects", async (req, res): Promise<void> => {
  if (!authedUserId(req, res)) return;
  const rows = await db.select().from(designCustomObjectsTable).orderBy(desc(designCustomObjectsTable.updatedAt), desc(designCustomObjectsTable.id));
  res.json(await toApi(rows));
});

router.post("/design-objects", async (req, res): Promise<void> => {
  const userId = authedUserId(req, res);
  if (!userId) return;
  const parsed = CreateDesignObjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: zodMessage(parsed.error) });
    return;
  }
  const name = parsed.data.name.trim();
  if (!name) {
    res.status(400).json({ error: "Give the object a name" });
    return;
  }
  const def = parseCustomDefinition(parsed.data.definition);
  if (!def.ok) {
    res.status(400).json({ error: def.error });
    return;
  }
  const [row] = await db
    .insert(designCustomObjectsTable)
    .values({
      name,
      category: cleanText(parsed.data.category) ?? "Other",
      description: cleanText(parsed.data.description),
      definition: def.definition,
      schemaVersion: DEFINITION_VERSION,
      revision: 1,
      createdBy: userId,
      updatedBy: userId,
    })
    .returning();
  res.status(201).json((await toApi([row]))[0]);
});

router.get("/design-objects/:id", async (req, res): Promise<void> => {
  if (!authedUserId(req, res)) return;
  const id = parseId(req.params.id);
  const [row] = id ? await db.select().from(designCustomObjectsTable).where(eq(designCustomObjectsTable.id, id)) : [];
  if (!row) {
    res.status(404).json({ error: "Custom object not found" });
    return;
  }
  res.json((await toApi([row]))[0]);
});

router.patch("/design-objects/:id", async (req, res): Promise<void> => {
  const userId = authedUserId(req, res);
  if (!userId) return;
  const id = parseId(req.params.id);
  if (!id) {
    res.status(404).json({ error: "Custom object not found" });
    return;
  }
  const parsed = UpdateDesignObjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: zodMessage(parsed.error) });
    return;
  }
  const body = parsed.data;
  const values: Partial<typeof designCustomObjectsTable.$inferInsert> = {};
  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name) {
      res.status(400).json({ error: "Give the object a name" });
      return;
    }
    values.name = name;
  }
  if (body.category !== undefined) values.category = cleanText(body.category) ?? "Other";
  if (body.description !== undefined) values.description = cleanText(body.description);
  if (body.definition !== undefined) {
    const def = parseCustomDefinition(body.definition);
    if (!def.ok) {
      res.status(400).json({ error: def.error });
      return;
    }
    values.definition = def.definition;
    values.schemaVersion = DEFINITION_VERSION;
  }
  // Compare-and-swap on the revision, as for design projects.
  const [saved] = await db
    .update(designCustomObjectsTable)
    .set({ ...values, revision: sql`${designCustomObjectsTable.revision} + 1`, updatedBy: userId, updatedAt: new Date() })
    .where(and(eq(designCustomObjectsTable.id, id), eq(designCustomObjectsTable.revision, body.baseRevision)))
    .returning();
  if (!saved) {
    const [current] = await db.select().from(designCustomObjectsTable).where(eq(designCustomObjectsTable.id, id));
    if (!current) {
      res.status(404).json({ error: "Custom object not found" });
      return;
    }
    const names = await loadUserNames([current.updatedBy]);
    res.status(409).json({
      error: "This custom object was changed somewhere else since you opened it",
      currentRevision: current.revision,
      updatedAt: current.updatedAt.toISOString(),
      updatedByName: current.updatedBy ? (names.get(current.updatedBy) ?? null) : null,
    });
    return;
  }
  res.json((await toApi([saved]))[0]);
});

router.delete("/design-objects/:id", async (req, res): Promise<void> => {
  if (!authedUserId(req, res)) return;
  const id = parseId(req.params.id);
  const deleted = id ? await db.delete(designCustomObjectsTable).where(eq(designCustomObjectsTable.id, id)).returning({ id: designCustomObjectsTable.id }) : [];
  if (deleted.length === 0) {
    res.status(404).json({ error: "Custom object not found" });
    return;
  }
  res.status(204).end();
});

router.post("/design-objects/:id/duplicate", async (req, res): Promise<void> => {
  const userId = authedUserId(req, res);
  if (!userId) return;
  const id = parseId(req.params.id);
  const parsed = DuplicateDesignObjectBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: zodMessage(parsed.error) });
    return;
  }
  const [source] = id ? await db.select().from(designCustomObjectsTable).where(eq(designCustomObjectsTable.id, id)) : [];
  if (!source) {
    res.status(404).json({ error: "Custom object not found" });
    return;
  }
  const [row] = await db
    .insert(designCustomObjectsTable)
    .values({
      name: cleanText(parsed.data.name) ?? `${source.name} (copy)`,
      category: source.category,
      description: source.description,
      definition: source.definition,
      schemaVersion: source.schemaVersion,
      revision: 1,
      createdBy: userId,
      updatedBy: userId,
    })
    .returning();
  res.status(201).json((await toApi([row]))[0]);
});

export default router;
