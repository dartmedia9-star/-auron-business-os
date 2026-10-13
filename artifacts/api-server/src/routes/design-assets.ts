import { createHash, randomUUID } from "node:crypto";
import express, { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, count, desc, eq, lt, sql } from "drizzle-orm";
import { db, designAssetsTable, designAssetUploadChunksTable, designAssetUploadsTable, type DesignAssetRow } from "@workspace/db";
import { CompleteDesignAssetUploadBody, RenameDesignAssetBody, StartDesignAssetUploadBody } from "@workspace/api-zod";
import { ASSET_LIMITS, readImageHeader, sniffKind } from "@workspace/design-model";
import { loadUserNames } from "../lib/user-names";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Event Design Studio image assets
//
// Designer artwork, reference drawings and images taken out of PDFs.
// Projects and custom objects refer to an asset by id (`assetId` in their
// JSON); the bytes are stored once, in design_assets, and de-duplicated by
// SHA-256.
//
// Uploads come in pieces of ASSET_LIMITS.chunkBytes (768 KB) so every
// request stays below Nginx's default 1 MB body limit:
//   1. POST /design-assets/uploads            start (or find an identical image)
//   2. PUT  /design-assets/uploads/:id/chunks/:index   one piece, raw bytes
//   3. POST /design-assets/uploads/:id/complete        assemble and check
// Each piece's length is checked (and its SHA-256 when the browser sends
// one); on completion the whole file's SHA-256, the real image type (from the
// bytes, not the name) and the pixel limits are checked before one row is
// written in a transaction. Unfinished uploads belong to the person who
// started them, expire after ASSET_LIMITS.uploadTtlHours and are removed
// whenever a new upload starts (and on server start).
//
// Visible to every signed-in user, like design projects. Nothing here touches
// a financial table.
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

const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const MB = (n: number) => `${Math.round((n / (1024 * 1024)) * 10) / 10} MB`;

/** Metadata columns only: never read image bytes for a list. */
const META = {
  id: designAssetsTable.id,
  name: designAssetsTable.name,
  kind: designAssetsTable.kind,
  mime: designAssetsTable.mime,
  width: designAssetsTable.width,
  height: designAssetsTable.height,
  byteSize: designAssetsTable.byteSize,
  sha256: designAssetsTable.sha256,
  hasThumb: sql<boolean>`${designAssetsTable.thumb} IS NOT NULL`,
  sourceName: designAssetsTable.sourceName,
  sourcePage: designAssetsTable.sourcePage,
  createdBy: designAssetsTable.createdBy,
  createdAt: designAssetsTable.createdAt,
};
type AssetMeta = Omit<Pick<DesignAssetRow, "id" | "name" | "kind" | "mime" | "width" | "height" | "byteSize" | "sha256" | "sourceName" | "sourcePage" | "createdBy" | "createdAt">, never> & { hasThumb: boolean };

async function toApi(rows: AssetMeta[]) {
  const names = await loadUserNames(rows.map((r) => r.createdBy));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    kind: r.kind as "image" | "pdf-image" | "pdf-page",
    mime: r.mime,
    width: r.width,
    height: r.height,
    byteSize: r.byteSize,
    sha256: r.sha256,
    hasThumb: !!r.hasThumb,
    sourceName: r.sourceName,
    sourcePage: r.sourcePage,
    createdByName: r.createdBy ? (names.get(r.createdBy) ?? null) : null,
    createdAt: r.createdAt.toISOString(),
  }));
}

async function metaById(id: number): Promise<AssetMeta | undefined> {
  const [row] = await db.select(META).from(designAssetsTable).where(eq(designAssetsTable.id, id));
  return row;
}

/** Removes unfinished uploads past their expiry (their pieces go with them). */
export async function removeExpiredUploads(): Promise<number> {
  const gone = await db.delete(designAssetUploadsTable).where(lt(designAssetUploadsTable.expiresAt, new Date())).returning({ id: designAssetUploadsTable.id });
  return gone.length;
}

/** Designs and custom objects whose JSON refers to the asset (`"assetId": id` anywhere inside). */
async function usageOf(id: number) {
  const vars = sql`jsonb_build_object('id', ${id}::int)`;
  const projects = await db.execute(sql`SELECT id, name FROM design_projects WHERE jsonb_path_exists(model, '$.**.assetId ? (@ == $id)', ${vars}) ORDER BY name`);
  const objects = await db.execute(sql`SELECT id, name FROM design_custom_objects WHERE jsonb_path_exists(definition, '$.**.assetId ? (@ == $id)', ${vars}) ORDER BY name`);
  const rows = (r: unknown) => ((r as { rows?: Array<{ id: number; name: string }> }).rows ?? (r as Array<{ id: number; name: string }>));
  return [
    ...rows(projects).map((r) => ({ type: "project" as const, id: Number(r.id), name: String(r.name) })),
    ...rows(objects).map((r) => ({ type: "customObject" as const, id: Number(r.id), name: String(r.name) })),
  ];
}

async function ownUpload(req: Request, res: Response, userId: string) {
  const id = String(req.params.uploadId ?? "");
  const [up] = /^[0-9a-f-]{36}$/.test(id) ? await db.select().from(designAssetUploadsTable).where(and(eq(designAssetUploadsTable.id, id), eq(designAssetUploadsTable.createdBy, userId))) : [];
  if (!up || up.expiresAt < new Date()) {
    res.status(404).json({ error: "This upload has expired or doesn't exist. Start the import again." });
    return null;
  }
  return up;
}

// ------------------------------------------------------------- listing ----

router.get("/design-assets", async (req, res): Promise<void> => {
  if (!authedUserId(req, res)) return;
  const rows = await db.select(META).from(designAssetsTable).orderBy(desc(designAssetsTable.createdAt), desc(designAssetsTable.id)).limit(1000);
  res.json(await toApi(rows));
});

// ------------------------------------------------------------- uploads ----

router.post("/design-assets/uploads", async (req, res): Promise<void> => {
  const userId = authedUserId(req, res);
  if (!userId) return;
  const parsed = StartDesignAssetUploadBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: zodMessage(parsed.error) });
    return;
  }
  const b = parsed.data;
  if (!Number.isInteger(b.byteSize) || b.byteSize > ASSET_LIMITS.maxBytes) {
    res.status(400).json({ error: `The file is ${MB(b.byteSize)}; the largest image accepted is ${MB(ASSET_LIMITS.maxBytes)}.` });
    return;
  }
  const name = b.name.trim();
  if (!name) {
    res.status(400).json({ error: "Give the image a name" });
    return;
  }
  await removeExpiredUploads();

  const [existing] = await db.select(META).from(designAssetsTable).where(eq(designAssetsTable.sha256, b.sha256));
  if (existing) {
    res.status(200).json({ status: "exists", asset: (await toApi([existing]))[0] });
    return;
  }
  const [{ open }] = await db.select({ open: count() }).from(designAssetUploadsTable).where(eq(designAssetUploadsTable.createdBy, userId));
  if (open >= ASSET_LIMITS.maxOpenUploadsPerUser) {
    res.status(429).json({ error: "Too many imports are still unfinished. Wait for them to finish (or cancel them) and try again." });
    return;
  }
  const chunkSize = ASSET_LIMITS.chunkBytes;
  const chunkCount = Math.ceil(b.byteSize / chunkSize);
  const expiresAt = new Date(Date.now() + ASSET_LIMITS.uploadTtlHours * 3600_000);
  const id = randomUUID();
  await db.insert(designAssetUploadsTable).values({
    id,
    name: name.slice(0, 200),
    kind: b.kind,
    byteSize: b.byteSize,
    sha256: b.sha256,
    chunkSize,
    chunkCount,
    sourceName: b.sourceName?.trim().slice(0, 300) || null,
    sourcePage: b.sourcePage ?? null,
    createdBy: userId,
    expiresAt,
  });
  res.status(201).json({ status: "upload", uploadId: id, chunkSize, chunkCount, expiresAt: expiresAt.toISOString() });
});

router.get("/design-assets/uploads/:uploadId", async (req, res): Promise<void> => {
  const userId = authedUserId(req, res);
  if (!userId) return;
  const up = await ownUpload(req, res, userId);
  if (!up) return;
  const got = await db.select({ idx: designAssetUploadChunksTable.idx }).from(designAssetUploadChunksTable).where(eq(designAssetUploadChunksTable.uploadId, up.id)).orderBy(asc(designAssetUploadChunksTable.idx));
  res.json({ uploadId: up.id, chunkSize: up.chunkSize, chunkCount: up.chunkCount, received: got.map((g) => g.idx), expiresAt: up.expiresAt.toISOString() });
});

router.put(
  "/design-assets/uploads/:uploadId/chunks/:index",
  express.raw({ type: "application/octet-stream", limit: ASSET_LIMITS.chunkBytes }),
  async (req, res): Promise<void> => {
    const userId = authedUserId(req, res);
    if (!userId) return;
    const up = await ownUpload(req, res, userId);
    if (!up) return;
    const idx = Number(req.params.index);
    if (!Number.isInteger(idx) || idx < 0 || idx >= up.chunkCount) {
      res.status(400).json({ error: `Piece ${req.params.index} is out of range (0–${up.chunkCount - 1}).` });
      return;
    }
    const body = req.body;
    if (!Buffer.isBuffer(body)) {
      res.status(400).json({ error: "Send the piece as application/octet-stream." });
      return;
    }
    const expected = idx < up.chunkCount - 1 ? up.chunkSize : up.byteSize - up.chunkSize * (up.chunkCount - 1);
    if (body.length !== expected) {
      res.status(400).json({ error: `Piece ${idx} should be ${expected} bytes but ${body.length} arrived. Try the import again.` });
      return;
    }
    const claimed = req.get("x-chunk-sha256");
    if (claimed && claimed.toLowerCase() !== sha256(body)) {
      res.status(400).json({ error: `Piece ${idx} was damaged on the way. Try again.` });
      return;
    }
    if (idx === 0) {
      // Fail fast on the wrong kind of file instead of after the last piece.
      const kind = sniffKind(body);
      if (kind !== "png" && kind !== "jpeg" && kind !== "webp") {
        const r = readImageHeader(body);
        await db.delete(designAssetUploadsTable).where(eq(designAssetUploadsTable.id, up.id));
        res.status(400).json({ error: r.ok ? "This file isn't a supported image." : r.error });
        return;
      }
    }
    // Re-sending a piece (a retry) replaces it.
    await db
      .insert(designAssetUploadChunksTable)
      .values({ uploadId: up.id, idx, data: body })
      .onConflictDoUpdate({ target: [designAssetUploadChunksTable.uploadId, designAssetUploadChunksTable.idx], set: { data: body } });
    res.status(204).end();
  },
);

router.post("/design-assets/uploads/:uploadId/complete", async (req, res): Promise<void> => {
  const userId = authedUserId(req, res);
  if (!userId) return;
  const parsed = CompleteDesignAssetUploadBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: zodMessage(parsed.error) });
    return;
  }
  // The thumbnail is made in the browser; it gets the same content checks.
  let thumb: { data: Buffer; mime: string } | null = null;
  if (parsed.data.thumbnail) {
    const data = Buffer.from(parsed.data.thumbnail, "base64");
    const h = readImageHeader(data);
    if (data.length > ASSET_LIMITS.maxThumbBytes || !h.ok || h.image.width > 1024 || h.image.height > 1024) {
      res.status(400).json({ error: "The preview image is invalid or too large." });
      return;
    }
    thumb = { data, mime: h.image.mime };
  }

  type Outcome = { status: number; body: unknown };
  const outcome = await db.transaction(async (tx): Promise<Outcome> => {
    const [up] = await tx
      .select()
      .from(designAssetUploadsTable)
      .where(and(eq(designAssetUploadsTable.id, String(req.params.uploadId ?? "")), eq(designAssetUploadsTable.createdBy, userId)))
      .for("update");
    if (!up || up.expiresAt < new Date()) return { status: 404, body: { error: "This upload has expired or doesn't exist. Start the import again." } };
    const pieces = await tx.select().from(designAssetUploadChunksTable).where(eq(designAssetUploadChunksTable.uploadId, up.id)).orderBy(asc(designAssetUploadChunksTable.idx));
    const missing: number[] = [];
    for (let i = 0, j = 0; i < up.chunkCount; i++) {
      if (pieces[j]?.idx === i) j++;
      else missing.push(i);
    }
    if (missing.length) return { status: 400, body: { error: `${missing.length} of ${up.chunkCount} pieces haven't arrived yet (first missing: ${missing[0]}).` } };
    const file = Buffer.concat(pieces.map((p) => p.data));
    const fail = async (error: string): Promise<Outcome> => {
      await tx.delete(designAssetUploadsTable).where(eq(designAssetUploadsTable.id, up.id));
      return { status: 400, body: { error } };
    };
    if (file.length !== up.byteSize) return fail(`The file arrived as ${file.length} bytes instead of ${up.byteSize}. Try the import again.`);
    if (sha256(file) !== up.sha256) return fail("The file was damaged on the way (checksum mismatch). Try the import again.");
    const header = readImageHeader(file);
    if (!header.ok) return fail(header.error);

    const [inserted] = await tx
      .insert(designAssetsTable)
      .values({
        name: up.name,
        kind: up.kind,
        mime: header.image.mime,
        width: header.image.width,
        height: header.image.height,
        byteSize: file.length,
        sha256: up.sha256,
        data: file,
        thumb: thumb?.data ?? null,
        thumbMime: thumb?.mime ?? null,
        sourceName: up.sourceName,
        sourcePage: up.sourcePage,
        createdBy: userId,
        updatedBy: userId,
      })
      .onConflictDoNothing({ target: designAssetsTable.sha256 })
      .returning({ id: designAssetsTable.id });
    await tx.delete(designAssetUploadsTable).where(eq(designAssetUploadsTable.id, up.id));
    if (inserted) return { status: 201, body: inserted.id };
    // Someone stored the same image meanwhile: use theirs.
    const [same] = await tx.select({ id: designAssetsTable.id }).from(designAssetsTable).where(eq(designAssetsTable.sha256, up.sha256));
    return { status: 200, body: same.id };
  });
  if (typeof outcome.body !== "number") {
    res.status(outcome.status).json(outcome.body);
    return;
  }
  const meta = await metaById(outcome.body);
  res.status(outcome.status).json((await toApi([meta!]))[0]);
});

router.delete("/design-assets/uploads/:uploadId", async (req, res): Promise<void> => {
  const userId = authedUserId(req, res);
  if (!userId) return;
  const up = await ownUpload(req, res, userId);
  if (!up) return;
  await db.delete(designAssetUploadsTable).where(eq(designAssetUploadsTable.id, up.id));
  res.status(204).end();
});

// -------------------------------------------------------------- assets ----

router.get("/design-assets/:id", async (req, res): Promise<void> => {
  if (!authedUserId(req, res)) return;
  const id = parseId(req.params.id);
  const row = id ? await metaById(id) : undefined;
  if (!row) {
    res.status(404).json({ error: "Image not found" });
    return;
  }
  res.json((await toApi([row]))[0]);
});

async function sendBytes(req: Request, res: Response, which: "file" | "thumb"): Promise<void> {
  if (!authedUserId(req, res)) return;
  const id = parseId(req.params.id);
  const [row] = id
    ? await db
        .select({
          sha256: designAssetsTable.sha256,
          mime: which === "file" ? designAssetsTable.mime : designAssetsTable.thumbMime,
          data: which === "file" ? designAssetsTable.data : designAssetsTable.thumb,
        })
        .from(designAssetsTable)
        .where(eq(designAssetsTable.id, id))
    : [];
  if (!row || !row.data || !row.mime) {
    res.status(404).json({ error: which === "file" ? "Image not found" : "No preview" });
    return;
  }
  const etag = `"${row.sha256}${which === "thumb" ? "-t" : ""}"`;
  // An asset's bytes never change (a new image gets a new id), so browsers may keep it.
  res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
  res.setHeader("ETag", etag);
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.get("if-none-match") === etag) {
    res.status(304).end();
    return;
  }
  res.setHeader("Content-Type", row.mime);
  res.setHeader("Content-Length", String(row.data.length));
  res.end(row.data);
}

router.get("/design-assets/:id/file", (req, res) => sendBytes(req, res, "file"));
router.get("/design-assets/:id/thumb", (req, res) => sendBytes(req, res, "thumb"));

router.patch("/design-assets/:id", async (req, res): Promise<void> => {
  const userId = authedUserId(req, res);
  if (!userId) return;
  const id = parseId(req.params.id);
  const parsed = RenameDesignAssetBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: zodMessage(parsed.error) });
    return;
  }
  const name = parsed.data.name.trim();
  if (!name) {
    res.status(400).json({ error: "Give the image a name" });
    return;
  }
  const [row] = id ? await db.update(designAssetsTable).set({ name, updatedBy: userId, updatedAt: new Date() }).where(eq(designAssetsTable.id, id)).returning({ id: designAssetsTable.id }) : [];
  if (!row) {
    res.status(404).json({ error: "Image not found" });
    return;
  }
  res.json((await toApi([(await metaById(row.id))!]))[0]);
});

router.get("/design-assets/:id/usage", async (req, res): Promise<void> => {
  if (!authedUserId(req, res)) return;
  const id = parseId(req.params.id);
  res.json(id ? await usageOf(id) : []);
});

router.delete("/design-assets/:id", async (req, res): Promise<void> => {
  if (!authedUserId(req, res)) return;
  const id = parseId(req.params.id);
  const row = id ? await metaById(id) : undefined;
  if (!id || !row) {
    res.status(404).json({ error: "Image not found" });
    return;
  }
  const usedBy = await usageOf(id);
  if (usedBy.length) {
    const first = usedBy.slice(0, 3).map((u) => `"${u.name}"`).join(", ");
    res.status(409).json({ error: `This image is still used by ${usedBy.length === 1 ? "" : `${usedBy.length} items including `}${first}. Remove it there first.`, usedBy });
    return;
  }
  await db.delete(designAssetsTable).where(eq(designAssetsTable.id, id));
  res.status(204).end();
});

export default router;
