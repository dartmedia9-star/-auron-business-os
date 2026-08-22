import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, notesTable } from "@workspace/db";

const router: IRouter = Router();

// GET /notes - List notes
router.get("/notes", async (req, res): Promise<void> => {
  const notes = await db.select().from(notesTable).orderBy(desc(notesTable.created_at));
  res.json(notes);
});

// POST /notes - Create a new note
router.post("/notes", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { content, is_pinned } = req.body;
  if (!content) { res.status(400).json({ error: "Content is required" }); return; }

  const [note] = await db.insert(notesTable).values({
    content,
    is_pinned: is_pinned || false,
  }).returning();

  res.status(201).json(note);
});

// PATCH /notes/:id - Update a note
router.patch("/notes/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const { content, is_pinned } = req.body;

  const [note] = await db.update(notesTable).set({ content, is_pinned }).where(eq(notesTable.id, id)).returning();
  if (!note) { res.status(404).json({ error: "Note not found" }); return; }
  res.json(note);
});

// DELETE /notes/:id - Delete a note
router.delete("/notes/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const [note] = await db.delete(notesTable).where(eq(notesTable.id, id)).returning();
  if (!note) { res.status(404).json({ error: "Note not found" }); return; }
  res.json(note);
});

// GET /notes/pinned - List pinned notes
router.get("/notes/pinned", async (req, res): Promise<void> => {
  const notes = await db.select().from(notesTable).where(eq(notesTable.is_pinned, true)).orderBy(desc(notesTable.created_at));
  res.json(notes);
});

export default router;