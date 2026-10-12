import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, clientsTable, designProjectsTable, eventsTable, type DesignProjectRow } from "@workspace/db";
import { CreateDesignProjectBody, DuplicateDesignProjectBody, UpdateDesignProjectBody } from "@workspace/api-zod";
import { SCHEMA_VERSION, createEmptyModel, parseProjectModel, type ProjectModel } from "@workspace/design-model";
import { loadUserNames } from "../lib/user-names";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Event Design Studio projects
//
// A project's design (`model`) is the structured, editable floor plan and 3D
// layout defined by lib/design-model. Every write is validated against that
// schema, so the database never holds a design the editor can't open.
//
// Saves are optimistic-concurrency writes: the client sends the revision it
// last loaded or saved (`baseRevision`); the UPDATE only matches that
// revision and bumps it, so two tabs or devices can never silently overwrite
// each other. A mismatch returns 409 with the current revision.
//
// Like every other record in the app, projects are visible to all signed-in
// users; created_by / updated_by record who did what. Nothing here touches a
// financial table or writes audit_logs (which the app reads as financial
// activity).
// ---------------------------------------------------------------------------

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

const summaryColumns = {
  id: designProjectsTable.id,
  name: designProjectsTable.name,
  venueName: designProjectsTable.venueName,
  clientId: designProjectsTable.clientId,
  clientName: designProjectsTable.clientName,
  linkedClientName: clientsTable.name,
  eventId: designProjectsTable.eventId,
  eventName: eventsTable.name,
  revision: designProjectsTable.revision,
  schemaVersion: designProjectsTable.schemaVersion,
  // Counts come from the JSON so the list never loads whole designs.
  roomCount: sql<number>`coalesce(jsonb_array_length(${designProjectsTable.model}->'rooms'), 0)`,
  objectCount: sql<number>`coalesce(jsonb_array_length(${designProjectsTable.model}->'objects'), 0)`,
  createdBy: designProjectsTable.createdBy,
  updatedBy: designProjectsTable.updatedBy,
  createdAt: designProjectsTable.createdAt,
  updatedAt: designProjectsTable.updatedAt,
};

type SummaryRow = {
  id: number;
  name: string;
  venueName: string | null;
  clientId: number | null;
  clientName: string | null;
  linkedClientName: string | null;
  eventId: number | null;
  eventName: string | null;
  revision: number;
  schemaVersion: number;
  roomCount: number;
  objectCount: number;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function toSummary(row: SummaryRow, names: Map<string, string | null>) {
  return {
    id: row.id,
    name: row.name,
    venueName: row.venueName,
    clientId: row.clientId,
    clientName: row.clientId != null ? (row.linkedClientName ?? row.clientName) : row.clientName,
    eventId: row.eventId,
    eventName: row.eventName,
    revision: row.revision,
    schemaVersion: row.schemaVersion,
    roomCount: Number(row.roomCount),
    objectCount: Number(row.objectCount),
    createdByName: row.createdBy ? (names.get(row.createdBy) ?? null) : null,
    updatedByName: row.updatedBy ? (names.get(row.updatedBy) ?? null) : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function loadSummary(id: number): Promise<SummaryRow | null> {
  const [row] = await db
    .select(summaryColumns)
    .from(designProjectsTable)
    .leftJoin(clientsTable, eq(clientsTable.id, designProjectsTable.clientId))
    .leftJoin(eventsTable, eq(eventsTable.id, designProjectsTable.eventId))
    .where(eq(designProjectsTable.id, id));
  return row ?? null;
}

async function fullProject(row: DesignProjectRow) {
  const summary = await loadSummary(row.id);
  if (!summary) return null;
  const names = await loadUserNames([summary.createdBy, summary.updatedBy]);
  return { ...toSummary(summary, names), model: row.model as Record<string, unknown> };
}

async function checkLinks(clientId: number | null | undefined, eventId: number | null | undefined): Promise<string | null> {
  if (clientId != null) {
    const [c] = await db.select({ id: clientsTable.id }).from(clientsTable).where(eq(clientsTable.id, clientId));
    if (!c) return "Choose an existing client";
  }
  if (eventId != null) {
    const [e] = await db.select({ id: eventsTable.id }).from(eventsTable).where(eq(eventsTable.id, eventId));
    if (!e) return "Choose an existing event";
  }
  return null;
}

router.get("/design-projects", async (req, res): Promise<void> => {
  if (!authedUserId(req, res)) return;
  const rows = await db
    .select(summaryColumns)
    .from(designProjectsTable)
    .leftJoin(clientsTable, eq(clientsTable.id, designProjectsTable.clientId))
    .leftJoin(eventsTable, eq(eventsTable.id, designProjectsTable.eventId))
    .orderBy(desc(designProjectsTable.updatedAt), desc(designProjectsTable.id));
  const names = await loadUserNames(rows.flatMap((r) => [r.createdBy, r.updatedBy]));
  res.json(rows.map((r) => toSummary(r, names)));
});

router.post("/design-projects", async (req, res): Promise<void> => {
  const userId = authedUserId(req, res);
  if (!userId) return;
  const parsed = CreateDesignProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: zodMessage(parsed.error) });
    return;
  }
  const body = parsed.data;
  const name = body.name.trim();
  if (!name) {
    res.status(400).json({ error: "Project name is required" });
    return;
  }
  const linkError = await checkLinks(body.clientId, body.eventId);
  if (linkError) {
    res.status(400).json({ error: linkError });
    return;
  }
  let model: ProjectModel;
  if (body.model) {
    const m = parseProjectModel(body.model);
    if (!m.ok) {
      res.status(400).json({ error: m.error });
      return;
    }
    model = m.model;
  } else {
    model = createEmptyModel({ venueName: cleanText(body.venueName) ?? "", title: name, client: cleanText(body.clientName) ?? "" });
  }
  const [row] = await db
    .insert(designProjectsTable)
    .values({
      name,
      venueName: cleanText(body.venueName),
      clientId: body.clientId ?? null,
      clientName: cleanText(body.clientName),
      eventId: body.eventId ?? null,
      model,
      schemaVersion: SCHEMA_VERSION,
      revision: 1,
      createdBy: userId,
      updatedBy: userId,
    })
    .returning();
  res.status(201).json(await fullProject(row));
});

router.get("/design-projects/:id", async (req, res): Promise<void> => {
  if (!authedUserId(req, res)) return;
  const id = parseId(req.params.id);
  if (!id) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const [row] = await db.select().from(designProjectsTable).where(eq(designProjectsTable.id, id));
  if (!row) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  res.json(await fullProject(row));
});

router.patch("/design-projects/:id", async (req, res): Promise<void> => {
  const userId = authedUserId(req, res);
  if (!userId) return;
  const id = parseId(req.params.id);
  if (!id) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const parsed = UpdateDesignProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: zodMessage(parsed.error) });
    return;
  }
  const body = parsed.data;

  const values: Partial<typeof designProjectsTable.$inferInsert> = {};
  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name) {
      res.status(400).json({ error: "Project name is required" });
      return;
    }
    values.name = name;
  }
  if (body.venueName !== undefined) values.venueName = cleanText(body.venueName);
  if (body.clientId !== undefined) values.clientId = body.clientId;
  if (body.clientName !== undefined) values.clientName = cleanText(body.clientName);
  if (body.eventId !== undefined) values.eventId = body.eventId;
  const linkError = await checkLinks(body.clientId, body.eventId);
  if (linkError) {
    res.status(400).json({ error: linkError });
    return;
  }
  if (body.model !== undefined) {
    const m = parseProjectModel(body.model);
    if (!m.ok) {
      res.status(400).json({ error: m.error });
      return;
    }
    values.model = m.model;
    values.schemaVersion = m.model.schemaVersion;
  }

  const [existing] = await db
    .select({ revision: designProjectsTable.revision, updatedAt: designProjectsTable.updatedAt, updatedBy: designProjectsTable.updatedBy })
    .from(designProjectsTable)
    .where(eq(designProjectsTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  // Compare-and-swap on the revision: one atomic statement, so two
  // overlapping saves can't both succeed against the same base.
  const base = body.force ? existing.revision : body.baseRevision;
  const [saved] = await db
    .update(designProjectsTable)
    .set({ ...values, revision: sql`${designProjectsTable.revision} + 1`, updatedBy: userId, updatedAt: new Date() })
    .where(and(eq(designProjectsTable.id, id), eq(designProjectsTable.revision, base)))
    .returning({ id: designProjectsTable.id, revision: designProjectsTable.revision, updatedAt: designProjectsTable.updatedAt });

  if (!saved) {
    const [current] = await db
      .select({ revision: designProjectsTable.revision, updatedAt: designProjectsTable.updatedAt, updatedBy: designProjectsTable.updatedBy })
      .from(designProjectsTable)
      .where(eq(designProjectsTable.id, id));
    if (!current) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    const names = await loadUserNames([current.updatedBy]);
    res.status(409).json({
      error: "This project was saved somewhere else since you opened it",
      currentRevision: current.revision,
      updatedAt: current.updatedAt.toISOString(),
      updatedByName: current.updatedBy ? (names.get(current.updatedBy) ?? null) : null,
    });
    return;
  }
  res.json({ id: saved.id, revision: saved.revision, updatedAt: saved.updatedAt.toISOString() });
});

router.delete("/design-projects/:id", async (req, res): Promise<void> => {
  if (!authedUserId(req, res)) return;
  const id = parseId(req.params.id);
  if (!id) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const deleted = await db.delete(designProjectsTable).where(eq(designProjectsTable.id, id)).returning({ id: designProjectsTable.id });
  if (deleted.length === 0) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  res.status(204).end();
});

router.post("/design-projects/:id/duplicate", async (req, res): Promise<void> => {
  const userId = authedUserId(req, res);
  if (!userId) return;
  const id = parseId(req.params.id);
  if (!id) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const parsed = DuplicateDesignProjectBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: zodMessage(parsed.error) });
    return;
  }
  const [source] = await db.select().from(designProjectsTable).where(eq(designProjectsTable.id, id));
  if (!source) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const name = cleanText(parsed.data.name) ?? `${source.name} (copy)`;
  const [row] = await db
    .insert(designProjectsTable)
    .values({
      name,
      venueName: source.venueName,
      clientId: source.clientId,
      clientName: source.clientName,
      eventId: source.eventId,
      model: source.model,
      schemaVersion: source.schemaVersion,
      revision: 1,
      createdBy: userId,
      updatedBy: userId,
    })
    .returning();
  res.status(201).json(await fullProject(row));
});

export default router;
