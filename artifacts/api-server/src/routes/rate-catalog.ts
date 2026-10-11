import { Router, type IRouter, type Request, type Response } from "express";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { db, rateCategoriesTable, rateItemsTable, rateItemRelationsTable, type RateItem } from "@workspace/db";
import { CreateRateCategoryBody, CreateRateItemBody, UpdateRateCategoryBody, UpdateRateItemBody } from "@workspace/api-zod";
import type { DbExecutor } from "../lib/fund-ledger";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Rate Calculator master catalog
//
// Internal reference rates for the Rate Calculator page. Nothing here is a
// financial record: no route reads or writes revenue, costs, expenses,
// receivables, fund transactions or quotations, and calculations themselves
// never reach the server (they live in the browser, priced from rate
// snapshots). The catalog starts empty; nothing is seeded.
//
// Items are never deleted, only deactivated (isActive = false), so a rate
// someone captured stays traceable to its item. A category can be deleted
// only while it has no items at all.
//
// Request bodies are validated with the generated Zod schemas (OpenAPI is the
// single source of the pricing-method list), then with the business rules in
// normalizeItem().
// ---------------------------------------------------------------------------

type ItemBody = ReturnType<typeof CreateRateItemBody.parse>;
type RelationBody = NonNullable<ItemBody["relations"]>[number];

class CatalogError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function parseId(value: unknown): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function pgErrorCode(err: unknown): string | undefined {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code ?? e?.cause?.code;
}

/** The signed-in user's id, or null after sending 401. */
function authedUserId(req: Request, res: Response): string | null {
  if (req.isAuthenticated()) return req.user.id;
  res.status(401).json({ error: "Unauthorized" });
  return null;
}

function handleError(res: Response, err: unknown, duplicateMessage: string): void {
  if (err instanceof CatalogError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (pgErrorCode(err) === "23505") {
    res.status(409).json({ error: duplicateMessage });
    return;
  }
  throw err;
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

/** Number → numeric text with at most `dp` decimals, or a 400. */
function decimalText(value: number | null | undefined, field: string, opts: { dp: number; max: number; positive?: boolean }): string | null {
  if (value == null) return null;
  if (!Number.isFinite(value) || value < 0) throw new CatalogError(400, `${field} must be zero or more`);
  if (opts.positive && value === 0) throw new CatalogError(400, `${field} must be greater than 0`);
  if (value > opts.max) throw new CatalogError(400, `${field} is too large`);
  const s = String(value);
  const m = /^\d+(?:\.(\d+))?$/.exec(s);
  if (!m || (m[1]?.length ?? 0) > opts.dp) throw new CatalogError(400, `${field} can have at most ${opts.dp} decimals`);
  return s;
}

const AREA_OR_LENGTH = new Set(["per_sqft", "per_sqm", "per_rft", "per_rmt"]);
const AREA = new Set(["per_sqft", "per_sqm"]);

/**
 * Applies the catalog's business rules to a complete item and returns the
 * row values. Fields that don't apply to the pricing method are cleared, so
 * a stored item never carries a setting it doesn't use.
 */
async function normalizeItem(exec: DbExecutor, body: ItemBody, itemId: number | null) {
  const name = body.name.trim();
  if (!name) throw new CatalogError(400, "Item name is required");

  const [category] = await exec.select({ id: rateCategoriesTable.id }).from(rateCategoriesTable).where(eq(rateCategoriesTable.id, body.categoryId));
  if (!category) throw new CatalogError(400, "Choose an existing category");

  const method = body.pricingMethod;
  const isPct = method === "percentage";
  const rate = decimalText(body.rate, isPct ? "Percentage" : "Rate", { dp: 2, max: isPct ? 1000 : 999_999_999_999 });

  const aliases = [...new Set((body.aliases ?? []).map((a) => a.trim()).filter(Boolean))];

  let percentageBase: string | null = null;
  let percentageBaseItemIds: number[] = [];
  if (isPct) {
    percentageBase = body.percentageBase ?? null;
    if (!percentageBase) throw new CatalogError(400, "Choose what the percentage is calculated on");
    if (percentageBase === "selected_items") {
      percentageBaseItemIds = [...new Set(body.percentageBaseItemIds ?? [])];
      if (itemId != null && percentageBaseItemIds.includes(itemId)) throw new CatalogError(400, "A percentage item can't be calculated on itself");
      if (percentageBaseItemIds.length === 0) throw new CatalogError(400, "Choose at least one item the percentage is calculated on");
      const bases = await exec.select({ id: rateItemsTable.id, method: rateItemsTable.pricingMethod }).from(rateItemsTable).where(inArray(rateItemsTable.id, percentageBaseItemIds));
      if (bases.length !== percentageBaseItemIds.length) throw new CatalogError(400, "A percentage base item no longer exists");
      if (bases.some((b) => b.method === "percentage")) throw new CatalogError(400, "A percentage can't be calculated on another percentage item");
    }
  }

  const minBillable = decimalText(body.minBillable, "Minimum", { dp: 4, max: 9_999_999_999 });
  const maxBillable = decimalText(body.maxBillable, "Maximum", { dp: 4, max: 9_999_999_999, positive: true });
  if (minBillable != null && maxBillable != null && Number(minBillable) > Number(maxBillable)) {
    throw new CatalogError(400, "Minimum can't be greater than maximum");
  }
  const usesLimits = method !== "fixed" && !isPct;

  return {
    name,
    categoryId: body.categoryId,
    subcategory: cleanText(body.subcategory),
    description: cleanText(body.description),
    aliases,
    rate,
    pricingMethod: method,
    unitLabel: method === "per_unit" ? cleanText(body.unitLabel) : null,
    percentageBase,
    percentageBaseItemIds,
    defaultLength: AREA_OR_LENGTH.has(method) ? decimalText(body.defaultLength, "Default length", { dp: 4, max: 100_000, positive: true }) : null,
    defaultWidth: AREA.has(method) ? decimalText(body.defaultWidth, "Default width", { dp: 4, max: 100_000, positive: true }) : null,
    defaultQuantity: method === "per_unit" ? decimalText(body.defaultQuantity, "Default quantity", { dp: 4, max: 1_000_000, positive: true }) : null,
    defaultDimensionUnit: AREA_OR_LENGTH.has(method) ? (body.defaultDimensionUnit ?? null) : null,
    minBillable: usesLimits ? minBillable : null,
    maxBillable: usesLimits ? maxBillable : null,
    conditions: cleanText(body.conditions),
    notes: cleanText(body.notes),
    isActive: body.isActive ?? true,
  };
}

/** Validates relations and drops exact duplicates. */
async function normalizeRelations(exec: DbExecutor, relations: RelationBody[], itemId: number | null) {
  const seen = new Set<string>();
  const out: Array<{ relatedItemId: number; relationType: string; note: string | null }> = [];
  for (const r of relations) {
    if (itemId != null && r.relatedItemId === itemId) throw new CatalogError(400, "An item can't be related to itself");
    const key = `${r.relatedItemId}:${r.relationType}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ relatedItemId: r.relatedItemId, relationType: r.relationType, note: cleanText(r.note) });
  }
  const ids = [...new Set(out.map((r) => r.relatedItemId))];
  if (ids.length > 0) {
    const found = await exec.select({ id: rateItemsTable.id }).from(rateItemsTable).where(inArray(rateItemsTable.id, ids));
    if (found.length !== ids.length) throw new CatalogError(400, "A related item no longer exists");
  }
  return out;
}

async function assertUniqueName(exec: DbExecutor, categoryId: number, name: string, exceptId: number | null): Promise<void> {
  const rows = await exec
    .select({ id: rateItemsTable.id })
    .from(rateItemsTable)
    .where(sql`${rateItemsTable.categoryId} = ${categoryId} and lower(btrim(${rateItemsTable.name})) = lower(btrim(${name}))`);
  if (rows.some((r) => r.id !== exceptId)) {
    throw new CatalogError(409, `"${name}" already exists in this category. Use a distinct name for a different variant.`);
  }
}

const num = (v: string | null): number | null => (v == null ? null : Number(v));

async function serializeItems(rows: RateItem[]) {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const [categories, relations] = await Promise.all([
    db.select({ id: rateCategoriesTable.id, name: rateCategoriesTable.name }).from(rateCategoriesTable),
    db.select().from(rateItemRelationsTable).where(inArray(rateItemRelationsTable.itemId, ids)).orderBy(asc(rateItemRelationsTable.id)),
  ]);
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    categoryId: r.categoryId,
    categoryName: categoryName.get(r.categoryId) ?? "",
    subcategory: r.subcategory,
    description: r.description,
    aliases: r.aliases,
    rate: num(r.rate),
    pricingMethod: r.pricingMethod,
    unitLabel: r.unitLabel,
    percentageBase: r.percentageBase,
    percentageBaseItemIds: r.percentageBaseItemIds,
    defaultLength: num(r.defaultLength),
    defaultWidth: num(r.defaultWidth),
    defaultQuantity: num(r.defaultQuantity),
    defaultDimensionUnit: r.defaultDimensionUnit,
    minBillable: num(r.minBillable),
    maxBillable: num(r.maxBillable),
    conditions: r.conditions,
    notes: r.notes,
    isActive: r.isActive,
    relations: relations
      .filter((rel) => rel.itemId === r.id)
      .map((rel) => ({ relatedItemId: rel.relatedItemId, relationType: rel.relationType, note: rel.note })),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

async function serializeItem(id: number) {
  const rows = await db.select().from(rateItemsTable).where(eq(rateItemsTable.id, id));
  return (await serializeItems(rows))[0] ?? null;
}

async function listCategories() {
  const [rows, counts] = await Promise.all([
    db
      .select()
      .from(rateCategoriesTable)
      .orderBy(asc(rateCategoriesTable.sortOrder), asc(sql`lower(${rateCategoriesTable.name})`)),
    db
      .select({
        categoryId: rateItemsTable.categoryId,
        itemCount: sql<number>`count(*)::int`,
        activeItemCount: sql<number>`(count(*) filter (where ${rateItemsTable.isActive}))::int`,
      })
      .from(rateItemsTable)
      .groupBy(rateItemsTable.categoryId),
  ]);
  const byCategory = new Map(counts.map((c) => [c.categoryId, c]));
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    sortOrder: c.sortOrder,
    itemCount: byCategory.get(c.id)?.itemCount ?? 0,
    activeItemCount: byCategory.get(c.id)?.activeItemCount ?? 0,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  }));
}

// ---- Categories -------------------------------------------------------------

router.get("/rate-catalog/categories", async (req, res): Promise<void> => {
  if (!authedUserId(req, res)) return;
  res.json(await listCategories());
});

router.post("/rate-catalog/categories", async (req, res): Promise<void> => {
  const userId = authedUserId(req, res);
  if (!userId) return;
  const parsed = CreateRateCategoryBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: zodMessage(parsed.error) }); return; }
  const name = parsed.data.name.trim();
  if (!name) { res.status(400).json({ error: "Category name is required" }); return; }
  try {
    const [row] = await db
      .insert(rateCategoriesTable)
      .values({ name, sortOrder: parsed.data.sortOrder ?? 0, createdBy: userId, updatedBy: userId })
      .returning();
    const created = (await listCategories()).find((c) => c.id === row.id);
    res.status(201).json(created);
  } catch (err) {
    handleError(res, err, `A category named "${name}" already exists`);
  }
});

router.patch("/rate-catalog/categories/:id", async (req, res): Promise<void> => {
  const userId = authedUserId(req, res);
  if (!userId) return;
  const id = parseId(req.params.id);
  if (!id) { res.status(404).json({ error: "Category not found" }); return; }
  const parsed = UpdateRateCategoryBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: zodMessage(parsed.error) }); return; }
  const name = parsed.data.name?.trim();
  if (parsed.data.name !== undefined && !name) { res.status(400).json({ error: "Category name is required" }); return; }
  try {
    const [row] = await db
      .update(rateCategoriesTable)
      .set({
        ...(name ? { name } : {}),
        ...(parsed.data.sortOrder !== undefined ? { sortOrder: parsed.data.sortOrder } : {}),
        updatedBy: userId,
      })
      .where(eq(rateCategoriesTable.id, id))
      .returning();
    if (!row) { res.status(404).json({ error: "Category not found" }); return; }
    res.json((await listCategories()).find((c) => c.id === id));
  } catch (err) {
    handleError(res, err, `A category named "${name}" already exists`);
  }
});

router.delete("/rate-catalog/categories/:id", async (req, res): Promise<void> => {
  if (!authedUserId(req, res)) return;
  const id = parseId(req.params.id);
  if (!id) { res.status(404).json({ error: "Category not found" }); return; }
  try {
    await db.transaction(async (tx) => {
      const [category] = await tx.select().from(rateCategoriesTable).where(eq(rateCategoriesTable.id, id)).for("update");
      if (!category) throw new CatalogError(404, "Category not found");
      const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(rateItemsTable).where(eq(rateItemsTable.categoryId, id));
      if (count > 0) {
        throw new CatalogError(409, `"${category.name}" still has ${count} item${count === 1 ? "" : "s"}. Move or deactivate them instead; items are never deleted.`);
      }
      await tx.delete(rateCategoriesTable).where(eq(rateCategoriesTable.id, id));
    });
    res.sendStatus(204);
  } catch (err) {
    if (pgErrorCode(err) === "23503") { res.status(409).json({ error: "This category still has items" }); return; }
    handleError(res, err, "Category conflict");
  }
});

// ---- Items ------------------------------------------------------------------

router.get("/rate-catalog/items", async (req, res): Promise<void> => {
  if (!authedUserId(req, res)) return;
  const rows = await db.select().from(rateItemsTable).orderBy(asc(sql`lower(${rateItemsTable.name})`), asc(rateItemsTable.id));
  res.json(await serializeItems(rows));
});

router.post("/rate-catalog/items", async (req, res): Promise<void> => {
  const userId = authedUserId(req, res);
  if (!userId) return;
  const parsed = CreateRateItemBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: zodMessage(parsed.error) }); return; }
  const body = parsed.data;
  try {
    const id = await db.transaction(async (tx) => {
      const values = await normalizeItem(tx, body, null);
      await assertUniqueName(tx, values.categoryId, values.name, null);
      const relations = await normalizeRelations(tx, body.relations ?? [], null);
      const [row] = await tx.insert(rateItemsTable).values({ ...values, createdBy: userId, updatedBy: userId }).returning();
      if (relations.length > 0) {
        await tx.insert(rateItemRelationsTable).values(relations.map((r) => ({ ...r, itemId: row.id })));
      }
      return row.id;
    });
    res.status(201).json(await serializeItem(id));
  } catch (err) {
    handleError(res, err, `"${body.name.trim()}" already exists in this category`);
  }
});

router.patch("/rate-catalog/items/:id", async (req, res): Promise<void> => {
  const userId = authedUserId(req, res);
  if (!userId) return;
  const id = parseId(req.params.id);
  if (!id) { res.status(404).json({ error: "Item not found" }); return; }
  const parsed = UpdateRateItemBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: zodMessage(parsed.error) }); return; }
  const patch = parsed.data;
  try {
    await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(rateItemsTable).where(eq(rateItemsTable.id, id)).for("update");
      if (!existing) throw new CatalogError(404, "Item not found");
      // Merge the patch over the stored item, then validate the whole item.
      const merged: ItemBody = {
        name: patch.name ?? existing.name,
        categoryId: patch.categoryId ?? existing.categoryId,
        subcategory: patch.subcategory !== undefined ? patch.subcategory : existing.subcategory,
        description: patch.description !== undefined ? patch.description : existing.description,
        aliases: patch.aliases ?? existing.aliases,
        rate: patch.rate !== undefined ? patch.rate : num(existing.rate),
        pricingMethod: patch.pricingMethod ?? (existing.pricingMethod as ItemBody["pricingMethod"]),
        unitLabel: patch.unitLabel !== undefined ? patch.unitLabel : existing.unitLabel,
        percentageBase: patch.percentageBase !== undefined ? patch.percentageBase : (existing.percentageBase as ItemBody["percentageBase"]),
        percentageBaseItemIds: patch.percentageBaseItemIds ?? existing.percentageBaseItemIds,
        defaultLength: patch.defaultLength !== undefined ? patch.defaultLength : num(existing.defaultLength),
        defaultWidth: patch.defaultWidth !== undefined ? patch.defaultWidth : num(existing.defaultWidth),
        defaultQuantity: patch.defaultQuantity !== undefined ? patch.defaultQuantity : num(existing.defaultQuantity),
        defaultDimensionUnit: patch.defaultDimensionUnit !== undefined ? patch.defaultDimensionUnit : (existing.defaultDimensionUnit as ItemBody["defaultDimensionUnit"]),
        minBillable: patch.minBillable !== undefined ? patch.minBillable : num(existing.minBillable),
        maxBillable: patch.maxBillable !== undefined ? patch.maxBillable : num(existing.maxBillable),
        conditions: patch.conditions !== undefined ? patch.conditions : existing.conditions,
        notes: patch.notes !== undefined ? patch.notes : existing.notes,
        isActive: patch.isActive ?? existing.isActive,
      };
      const values = await normalizeItem(tx, merged, id);
      await assertUniqueName(tx, values.categoryId, values.name, id);
      // A percentage is never calculated on another percentage, so an item
      // that is some percentage's base can't become a percentage itself.
      if (existing.pricingMethod !== "percentage" && values.pricingMethod === "percentage") {
        const [{ count }] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(rateItemsTable)
          .where(sql`${id} = any(${rateItemsTable.percentageBaseItemIds})`);
        if (count > 0) throw new CatalogError(400, "Other percentage items are calculated on this item, so it can't become a percentage item");
      }
      await tx.update(rateItemsTable).set({ ...values, updatedBy: userId }).where(eq(rateItemsTable.id, id));
      if (patch.relations !== undefined) {
        const relations = await normalizeRelations(tx, patch.relations, id);
        // Relations are configuration, not history: an edit replaces them.
        await tx.delete(rateItemRelationsTable).where(eq(rateItemRelationsTable.itemId, id));
        if (relations.length > 0) {
          await tx.insert(rateItemRelationsTable).values(relations.map((r) => ({ ...r, itemId: id })));
        }
      }
    });
    res.json(await serializeItem(id));
  } catch (err) {
    handleError(res, err, "An item with this name already exists in this category");
  }
});

export default router;
