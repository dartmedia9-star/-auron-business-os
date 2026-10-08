import { Router, type IRouter } from "express";
import { eq, desc, ilike, or, sql, inArray } from "drizzle-orm";
import { db, clientsTable, eventsTable, eventRevenueTable, clientPaymentsTable, paymentAllocationsTable } from "@workspace/db";
import { getEventDirectCostTotals } from "../lib/event-financials";

const router: IRouter = Router();

async function computeClientStats(clientId: number) {
  const events = await db.select().from(eventsTable).where(eq(eventsTable.clientId, clientId));
  const eventIds = events.map(event => event.id);
  const [revenues, directCostsByEvent, clientPayments] = await Promise.all([
    db.select().from(eventRevenueTable),
    getEventDirectCostTotals(eventIds),
    db.select().from(clientPaymentsTable).where(eq(clientPaymentsTable.clientId, clientId)),
  ]);
  const clientRevenues = revenues.filter(revenue => eventIds.includes(revenue.eventId));
  const lifetimeRevenue = clientRevenues.reduce((sum, revenue) => sum + parseFloat(String(revenue.netRevenue)), 0);
  const totalDirectCost = eventIds.reduce((sum, eventId) => sum + (directCostsByEvent.get(eventId) ?? 0), 0);

  // Compatibility-safe "received" calculation:
  // - legacyCollected: historical event-level totalCollected (existing data)
  // - newReceived: newly recorded client-level payments (client_payments)
  // These are distinct pools and NEVER both update for the same new payment, so
  // adding them does not double count.
  const legacyCollected = clientRevenues.reduce((sum, revenue) => sum + parseFloat(String(revenue.totalCollected)), 0);
  const newReceived = clientPayments.reduce((sum, p) => sum + parseFloat(String(p.amount)), 0);
  const totalReceived = legacyCollected + newReceived;
  // Outstanding cannot fall below zero; excess becomes a credit/advance.
  let totalOutstanding = lifetimeRevenue - totalReceived;
  let creditBalance = 0;
  if (totalOutstanding < 0) {
    creditBalance = -totalOutstanding;
    totalOutstanding = 0;
  }

  // Unallocated amount: new client payments minus what's been allocated to events.
  const paymentIds = clientPayments.map((p) => p.id);
  const allocs = paymentIds.length > 0
    ? await db.select().from(paymentAllocationsTable).where(inArray(paymentAllocationsTable.paymentId, paymentIds))
    : [];
  const allocatedTotal = allocs.reduce((sum, a) => sum + parseFloat(String(a.amount)), 0);
  const unallocatedAmount = newReceived - allocatedTotal;

  return [{
    clientId,
    totalEvents: eventIds.length,
    lifetimeRevenue,
    lifetimeGrossProfit: lifetimeRevenue - totalDirectCost,
    totalCollected: totalReceived,
    totalOutstanding,
    creditBalance,
    unallocatedAmount,
  }];
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
      totalCollected: parseFloat(String(s?.totalCollected ?? 0)),
      creditBalance: parseFloat(String(s?.creditBalance ?? 0)),
      unallocatedAmount: parseFloat(String(s?.unallocatedAmount ?? 0)),
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
  res.status(201).json({ ...client, totalEvents: 0, lifetimeRevenue: 0, lifetimeGrossProfit: 0, totalOutstanding: 0, totalCollected: 0, creditBalance: 0, unallocatedAmount: 0, repeatClient: false, firstEventDate: null, lastEventDate: null });
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
    totalCollected: parseFloat(String(s?.totalCollected ?? 0)),
    creditBalance: parseFloat(String(s?.creditBalance ?? 0)),
    unallocatedAmount: parseFloat(String(s?.unallocatedAmount ?? 0)),
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
  res.json({ ...client, totalEvents, lifetimeRevenue: parseFloat(String(s?.lifetimeRevenue ?? 0)), lifetimeGrossProfit: parseFloat(String(s?.lifetimeGrossProfit ?? 0)), totalOutstanding: parseFloat(String(s?.totalOutstanding ?? 0)), totalCollected: parseFloat(String(s?.totalCollected ?? 0)), creditBalance: parseFloat(String(s?.creditBalance ?? 0)), unallocatedAmount: parseFloat(String(s?.unallocatedAmount ?? 0)), repeatClient: totalEvents > 1, firstEventDate: events[0]?.eventDate ?? null, lastEventDate: events[events.length - 1]?.eventDate ?? null });
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

  const [revenues, directCostsByEvent] = await Promise.all([
    db.select().from(eventRevenueTable),
    getEventDirectCostTotals(events.map(event => event.id)),
  ]);
  const eventDetails = events.map((ev) => {
    const revenue = revenues.find(item => item.eventId === ev.id);
    const totalCost = directCostsByEvent.get(ev.id) ?? 0;
    const rev = parseFloat(String(revenue?.netRevenue ?? 0));
    const gp = rev - totalCost;
    return { id: ev.id, name: ev.name, date: ev.date, revenue: rev, grossProfit: gp, grossMarginPct: rev > 0 ? (gp / rev) * 100 : 0 };
  });

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
