import { Router, type IRouter } from "express";
import { eq, desc, ilike, or, sql } from "drizzle-orm";
import { db, clientsTable, eventsTable, eventRevenueTable, eventCostsTable } from "@workspace/db";

const router: IRouter = Router();

function computeClientStats(clientId: number) {
  return db
    .select({
      clientId: eventsTable.clientId,
      totalEvents: sql<number>`count(${eventsTable.id})::int`,
      lifetimeRevenue: sql<number>`coalesce(sum(${eventRevenueTable.netRevenue}), 0)`,
      lifetimeGrossProfit: sql<number>`coalesce(sum(${eventRevenueTable.netRevenue}) - sum(${eventCostsTable.totalAmount}), 0)`,
      totalCollected: sql<number>`coalesce(sum(${eventRevenueTable.totalCollected}), 0)`,
      totalOutstanding: sql<number>`coalesce(sum(${eventRevenueTable.outstandingAmount}), 0)`,
    })
    .from(eventsTable)
    .leftJoin(eventRevenueTable, eq(eventRevenueTable.eventId, eventsTable.id))
    .leftJoin(eventCostsTable, eq(eventCostsTable.eventId, eventsTable.id))
    .where(eq(eventsTable.clientId, clientId))
    .groupBy(eventsTable.clientId);
}

router.get("/clients", async (req, res): Promise<void> => {
  const { search, clientType, sortBy, page = "1", limit = "50" } = req.query as Record<string, string>;
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;

  let whereClause = sql`1=1`;
  if (search) {
    whereClause = sql`(${ilike(clientsTable.name, `%${search}%`)} OR ${ilike(clientsTable.company, `%${search}%`)})`;
  }
  if (clientType) {
    whereClause = sql`${whereClause} AND ${eq(clientsTable.clientType, clientType)}`;
  }

  const [clients, totalResult] = await Promise.all([
    db.select().from(clientsTable).where(whereClause).orderBy(desc(clientsTable.createdAt)).limit(limitNum).offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(clientsTable).where(whereClause),
  ]);

  // Enrich with stats
  const enriched = await Promise.all(clients.map(async (client) => {
    const stats = await computeClientStats(client.id);
    const s = stats[0];
    const events = await db.select({ eventDate: eventsTable.eventDate })
      .from(eventsTable).where(eq(eventsTable.clientId, client.id)).orderBy(eventsTable.eventDate);
    const totalEvents = s?.totalEvents ?? 0;
    const repeatClient = totalEvents > 1;
    return {
      ...client,
      totalEvents,
      lifetimeRevenue: parseFloat(String(s?.lifetimeRevenue ?? 0)),
      lifetimeGrossProfit: parseFloat(String(s?.lifetimeGrossProfit ?? 0)),
      totalOutstanding: parseFloat(String(s?.totalOutstanding ?? 0)),
      repeatClient,
      firstEventDate: events[0]?.eventDate ?? null,
      lastEventDate: events[events.length - 1]?.eventDate ?? null,
    };
  }));

  res.json({ data: enriched, total: totalResult[0]?.count ?? 0, page: pageNum, limit: limitNum });
});

router.post("/clients", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { name, clientType = "Corporate", ...rest } = req.body;
  if (!name) { res.status(400).json({ error: "name is required" }); return; }

  const [client] = await db.insert(clientsTable).values({
    name, clientType, ...rest, createdBy: req.user.id,
  }).returning();
  const stats = await computeClientStats(client.id);
  res.status(201).json({ ...client, totalEvents: 0, lifetimeRevenue: 0, lifetimeGrossProfit: 0, totalOutstanding: 0, repeatClient: false, firstEventDate: null, lastEventDate: null });
});

router.get("/clients/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, id));
  if (!client) { res.status(404).json({ error: "Client not found" }); return; }
  const stats = await computeClientStats(id);
  const s = stats[0];
  const events = await db.select({ eventDate: eventsTable.eventDate }).from(eventsTable).where(eq(eventsTable.clientId, id)).orderBy(eventsTable.eventDate);
  const totalEvents = s?.totalEvents ?? 0;
  res.json({
    ...client,
    totalEvents,
    lifetimeRevenue: parseFloat(String(s?.lifetimeRevenue ?? 0)),
    lifetimeGrossProfit: parseFloat(String(s?.lifetimeGrossProfit ?? 0)),
    totalOutstanding: parseFloat(String(s?.totalOutstanding ?? 0)),
    repeatClient: totalEvents > 1,
    firstEventDate: events[0]?.eventDate ?? null,
    lastEventDate: events[events.length - 1]?.eventDate ?? null,
  });
});

router.patch("/clients/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const { id: _id, createdAt, updatedAt, ...data } = req.body;
  const [client] = await db.update(clientsTable).set({ ...data, updatedBy: req.user.id }).where(eq(clientsTable.id, id)).returning();
  if (!client) { res.status(404).json({ error: "Client not found" }); return; }
  const stats = await computeClientStats(id);
  const s = stats[0];
  const events = await db.select({ eventDate: eventsTable.eventDate }).from(eventsTable).where(eq(eventsTable.clientId, id)).orderBy(eventsTable.eventDate);
  const totalEvents = s?.totalEvents ?? 0;
  res.json({ ...client, totalEvents, lifetimeRevenue: parseFloat(String(s?.lifetimeRevenue ?? 0)), lifetimeGrossProfit: parseFloat(String(s?.lifetimeGrossProfit ?? 0)), totalOutstanding: parseFloat(String(s?.totalOutstanding ?? 0)), repeatClient: totalEvents > 1, firstEventDate: events[0]?.eventDate ?? null, lastEventDate: events[events.length - 1]?.eventDate ?? null });
});

router.delete("/clients/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [client] = await db.delete(clientsTable).where(eq(clientsTable.id, id)).returning();
  if (!client) { res.status(404).json({ error: "Client not found" }); return; }
  res.sendStatus(204);
});

router.get("/clients/:id/profitability", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const events = await db.select({
    id: eventsTable.id,
    name: eventsTable.name,
    date: eventsTable.eventDate,
  }).from(eventsTable).where(eq(eventsTable.clientId, id)).orderBy(desc(eventsTable.eventDate));

  const eventDetails = await Promise.all(events.map(async (ev) => {
    const [revenue] = await db.select().from(eventRevenueTable).where(eq(eventRevenueTable.eventId, ev.id));
    const costs = await db.select({ totalAmount: eventCostsTable.totalAmount }).from(eventCostsTable).where(eq(eventCostsTable.eventId, ev.id));
    const totalCost = costs.reduce((s, c) => s + parseFloat(String(c.totalAmount)), 0);
    const rev = parseFloat(String(revenue?.netRevenue ?? 0));
    const gp = rev - totalCost;
    return { id: ev.id, name: ev.name, date: ev.date, revenue: rev, grossProfit: gp, grossMarginPct: rev > 0 ? (gp / rev) * 100 : 0 };
  }));

  const totalRevenue = eventDetails.reduce((s, e) => s + e.revenue, 0);
  const totalCostSum = eventDetails.reduce((s, e) => s + (e.revenue - e.grossProfit), 0);
  const grossProfit = totalRevenue - totalCostSum;

  res.json({
    clientId: id,
    totalRevenue,
    totalCost: totalCostSum,
    grossProfit,
    grossMarginPct: totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0,
    totalCollected: 0,
    totalOutstanding: 0,
    ltv: grossProfit,
    events: eventDetails,
  });
});

export default router;
