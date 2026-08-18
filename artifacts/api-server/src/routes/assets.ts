import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, assetsTable } from "@workspace/db";

const router: IRouter = Router();

function formatAsset(asset: typeof assetsTable.$inferSelect) {
  return {
    ...asset,
    purchaseCost: parseFloat(String(asset.purchaseCost)),
    currentBookValue: asset.currentBookValue ? parseFloat(String(asset.currentBookValue)) : null,
    maintenanceCost: parseFloat(String(asset.maintenanceCost)),
    rentalValue: asset.rentalValue ? parseFloat(String(asset.rentalValue)) : null,
    totalEventsUsed: 0,
    utilizationPct: 0,
    roi: null,
  };
}

router.get("/assets", async (req, res): Promise<void> => {
  const { category, condition } = req.query as Record<string, string>;
  let assets = await db.select().from(assetsTable).orderBy(desc(assetsTable.createdAt));
  if (category) assets = assets.filter(a => a.category === category);
  if (condition) assets = assets.filter(a => a.condition === condition);
  res.json(assets.map(formatAsset));
});

router.post("/assets", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { name, category, purchaseDate, purchaseCost, ...rest } = req.body;
  if (!name || !category || !purchaseDate || !purchaseCost) { res.status(400).json({ error: "name, category, purchaseDate, purchaseCost required" }); return; }
  const [asset] = await db.insert(assetsTable).values({ name, category, purchaseDate, purchaseCost: String(purchaseCost), createdBy: req.user.id, ...rest }).returning();
  res.status(201).json(formatAsset(asset));
});

router.get("/assets/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [asset] = await db.select().from(assetsTable).where(eq(assetsTable.id, id));
  if (!asset) { res.status(404).json({ error: "Asset not found" }); return; }
  res.json(formatAsset(asset));
});

router.patch("/assets/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const { id: _id, createdAt, updatedAt, ...data } = req.body;
  const [asset] = await db.update(assetsTable).set({ ...data, updatedBy: req.user.id }).where(eq(assetsTable.id, id)).returning();
  if (!asset) { res.status(404).json({ error: "Asset not found" }); return; }
  res.json(formatAsset(asset));
});

router.delete("/assets/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [asset] = await db.delete(assetsTable).where(eq(assetsTable.id, id)).returning();
  if (!asset) { res.status(404).json({ error: "Asset not found" }); return; }
  res.sendStatus(204);
});

export default router;
