import { Router, type IRouter } from "express";
import { eq, desc, sql, ilike } from "drizzle-orm";
import { db, vendorsTable, eventCostsTable, eventsTable } from "@workspace/db";

const router: IRouter = Router();

async function getVendorStats(vendorId: number) {
  const costs = await db.select({ amount: eventCostsTable.totalAmount, paymentStatus: eventCostsTable.paymentStatus, eventId: eventCostsTable.eventId })
    .from(eventCostsTable).where(eq(eventCostsTable.vendorId, vendorId));
  const totalSpend = costs.reduce((s, c) => s + parseFloat(String(c.amount)), 0);
  const uniqueEvents = new Set(costs.map(c => c.eventId)).size;
  const avgCostPerEvent = uniqueEvents > 0 ? totalSpend / uniqueEvents : 0;
  const outstandingPayment = costs.filter(c => c.paymentStatus === "pending").reduce((s, c) => s + parseFloat(String(c.amount)), 0);
  return { totalSpend, totalEvents: uniqueEvents, avgCostPerEvent, outstandingPayment };
}

router.get("/vendors", async (req, res): Promise<void> => {
  const { search, category } = req.query as Record<string, string>;
  let vendors = await db.select().from(vendorsTable).orderBy(desc(vendorsTable.createdAt));
  if (search) vendors = vendors.filter(v => v.name.toLowerCase().includes(search.toLowerCase()));
  if (category) vendors = vendors.filter(v => v.category === category);

  const enriched = await Promise.all(vendors.map(async (vendor) => {
    const stats = await getVendorStats(vendor.id);
    return { ...vendor, ...stats };
  }));
  res.json(enriched);
});

router.post("/vendors", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { name, category, ...rest } = req.body;
  if (!name || !category) { res.status(400).json({ error: "name and category are required" }); return; }
  const [vendor] = await db.insert(vendorsTable).values({ name, category, ...rest, createdBy: req.user.id }).returning();
  res.status(201).json({ ...vendor, totalSpend: 0, totalEvents: 0, avgCostPerEvent: 0, outstandingPayment: 0 });
});

router.get("/vendors/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, id));
  if (!vendor) { res.status(404).json({ error: "Vendor not found" }); return; }
  const stats = await getVendorStats(id);
  res.json({ ...vendor, ...stats });
});

router.patch("/vendors/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const { id: _id, createdAt, updatedAt, ...data } = req.body;
  const [vendor] = await db.update(vendorsTable).set({ ...data, updatedBy: req.user.id }).where(eq(vendorsTable.id, id)).returning();
  if (!vendor) { res.status(404).json({ error: "Vendor not found" }); return; }
  const stats = await getVendorStats(id);
  res.json({ ...vendor, ...stats });
});

router.delete("/vendors/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [vendor] = await db.delete(vendorsTable).where(eq(vendorsTable.id, id)).returning();
  if (!vendor) { res.status(404).json({ error: "Vendor not found" }); return; }
  res.sendStatus(204);
});

router.get("/vendors/:id/stats", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const costs = await db.select().from(eventCostsTable).where(eq(eventCostsTable.vendorId, id));
  const stats = await getVendorStats(id);
  const events = await Promise.all(costs.map(async (c) => {
    const [ev] = await db.select({ name: eventsTable.name }).from(eventsTable).where(eq(eventsTable.id, c.eventId));
    return { eventId: c.eventId, eventName: ev?.name ?? "Unknown", amount: parseFloat(String(c.totalAmount)), paymentStatus: c.paymentStatus };
  }));
  res.json({ vendorId: id, ...stats, events });
});

export default router;
