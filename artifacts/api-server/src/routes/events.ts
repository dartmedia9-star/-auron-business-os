import { Router, type IRouter } from "express";
import { eq, desc, sql, and, gte, lte } from "drizzle-orm";
import { db, eventsTable, clientsTable, eventRevenueTable, eventCostsTable, companySettingsTable } from "@workspace/db";
import { getEventDirectCostTotals } from "../lib/event-financials";

const router: IRouter = Router();

async function getEventWithProfitability(eventId: number) {
  const [event] = await db.select({
    event: eventsTable,
    clientName: clientsTable.name,
  }).from(eventsTable).leftJoin(clientsTable, eq(clientsTable.id, eventsTable.clientId)).where(eq(eventsTable.id, eventId));
  
  if (!event) return null;

  const [revenue] = await db.select().from(eventRevenueTable).where(eq(eventRevenueTable.eventId, eventId));
  const directCostsByEvent = await getEventDirectCostTotals([eventId]);
  
  const [settings] = await db.select().from(companySettingsTable).limit(1);
  const excellentThreshold = parseFloat(String(settings?.excellentMarginThreshold ?? 35));
  const healthyThreshold = parseFloat(String(settings?.healthyMarginThreshold ?? 20));
  const warningThreshold = parseFloat(String(settings?.warningMarginThreshold ?? 10));

  const netRevenue = parseFloat(String(revenue?.netRevenue ?? 0));
  const totalCost = directCostsByEvent.get(eventId) ?? 0;
  const grossProfit = netRevenue - totalCost;
  const grossMarginPct = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0;
  const totalCollected = parseFloat(String(revenue?.totalCollected ?? 0));
  const totalOutstanding = parseFloat(String(revenue?.outstandingAmount ?? 0));

  let profitabilityIndicator: string;
  if (netRevenue === 0 && totalCost === 0) profitabilityIndicator = "awaiting_data";
  else if (grossProfit < 0) profitabilityIndicator = "loss";
  else if (grossMarginPct >= excellentThreshold) profitabilityIndicator = "excellent";
  else if (grossMarginPct >= healthyThreshold) profitabilityIndicator = "healthy";
  else if (grossMarginPct >= warningThreshold) profitabilityIndicator = "warning";
  else profitabilityIndicator = "loss";

  return {
    ...event.event,
    clientName: event.clientName,
    totalRevenue: netRevenue,
    totalCost,
    grossProfit,
    grossMarginPct,
    profitabilityIndicator,
    totalCollected,
    totalOutstanding,
  };
}

router.get("/events", async (req, res): Promise<void> => {
  const { search, status, eventType, clientId, fromDate, toDate, page = "1", limit = "50" } = req.query as Record<string, string>;
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;

  const conditions = [];
  if (status) conditions.push(eq(eventsTable.status, status));
  if (eventType) conditions.push(eq(eventsTable.eventType, eventType));
  if (clientId) conditions.push(eq(eventsTable.clientId, parseInt(clientId, 10)));
  if (fromDate) conditions.push(gte(eventsTable.eventDate, fromDate));
  if (toDate) conditions.push(lte(eventsTable.eventDate, toDate));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [events, totalResult] = await Promise.all([
    db.select({ event: eventsTable, clientName: clientsTable.name })
      .from(eventsTable)
      .leftJoin(clientsTable, eq(clientsTable.id, eventsTable.clientId))
      .where(where)
      .orderBy(desc(eventsTable.eventDate))
      .limit(limitNum)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(eventsTable).where(where),
  ]);

  const directCostsByEvent = await getEventDirectCostTotals(events.map(row => row.event.id));
  const enriched = await Promise.all(events.map(async (row) => {
    const [revenue] = await db.select().from(eventRevenueTable).where(eq(eventRevenueTable.eventId, row.event.id));
    const netRevenue = parseFloat(String(revenue?.netRevenue ?? 0));
    const totalCost = directCostsByEvent.get(row.event.id) ?? 0;
    const grossProfit = netRevenue - totalCost;
    const grossMarginPct = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0;
    const [settings] = await db.select().from(companySettingsTable).limit(1);
    const excellentThreshold = parseFloat(String(settings?.excellentMarginThreshold ?? 35));
    const healthyThreshold = parseFloat(String(settings?.healthyMarginThreshold ?? 20));
    const warningThreshold = parseFloat(String(settings?.warningMarginThreshold ?? 10));
    let profitabilityIndicator: string;
    if (netRevenue === 0 && totalCost === 0) profitabilityIndicator = "awaiting_data";
    else if (grossProfit < 0) profitabilityIndicator = "loss";
    else if (grossMarginPct >= excellentThreshold) profitabilityIndicator = "excellent";
    else if (grossMarginPct >= healthyThreshold) profitabilityIndicator = "healthy";
    else if (grossMarginPct >= warningThreshold) profitabilityIndicator = "warning";
    else profitabilityIndicator = "loss";
    return {
      ...row.event,
      clientName: row.clientName,
      totalRevenue: netRevenue,
      totalCost,
      grossProfit,
      grossMarginPct,
      profitabilityIndicator,
      totalCollected: parseFloat(String(revenue?.totalCollected ?? 0)),
      totalOutstanding: parseFloat(String(revenue?.outstandingAmount ?? 0)),
    };
  }));

  res.json({ data: enriched, total: totalResult[0]?.count ?? 0, page: pageNum, limit: limitNum });
});

router.post("/events", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { name, clientId, eventType, status = "upcoming", eventDate, ...rest } = req.body;
  if (!name || !clientId || !eventType || !eventDate) { res.status(400).json({ error: "name, clientId, eventType, eventDate are required" }); return; }
  const [event] = await db.insert(eventsTable).values({ name, clientId: parseInt(String(clientId), 10), eventType, status, eventDate, ...rest, createdBy: req.user.id }).returning();
  res.status(201).json({ ...event, clientName: null, totalRevenue: 0, totalCost: 0, grossProfit: 0, grossMarginPct: 0, profitabilityIndicator: "awaiting_data", totalCollected: 0, totalOutstanding: 0 });
});

router.get("/events/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const event = await getEventWithProfitability(id);
  if (!event) { res.status(404).json({ error: "Event not found" }); return; }
  const [revenue] = await db.select().from(eventRevenueTable).where(eq(eventRevenueTable.eventId, id));
  const costs = await db.select().from(eventCostsTable).where(eq(eventCostsTable.eventId, id));
  
  const formatRevenue = revenue ? {
    id: revenue.id, eventId: revenue.eventId,
    contractValue: parseFloat(String(revenue.contractValue)),
    discount: parseFloat(String(revenue.discount)),
    gst: parseFloat(String(revenue.gst)),
    totalInvoiceValue: parseFloat(String(revenue.totalInvoiceValue)),
    netRevenue: parseFloat(String(revenue.netRevenue)),
    advanceReceived: parseFloat(String(revenue.advanceReceived)),
    secondPayment: parseFloat(String(revenue.secondPayment)),
    finalPayment: parseFloat(String(revenue.finalPayment)),
    totalCollected: parseFloat(String(revenue.totalCollected)),
    outstandingAmount: parseFloat(String(revenue.outstandingAmount)),
    paymentStatus: revenue.paymentStatus, invoiceNumber: revenue.invoiceNumber, dueDate: revenue.dueDate,
    createdAt: revenue.createdAt,
  } : null;

  const formatCosts = costs.map(c => ({
    ...c, amount: parseFloat(String(c.amount)), gst: parseFloat(String(c.gst)), totalAmount: parseFloat(String(c.totalAmount)),
  }));

  res.json({ ...event, revenue: formatRevenue, costs: formatCosts });
});

router.patch("/events/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const { id: _id, createdAt, updatedAt, clientName, totalRevenue, totalCost, grossProfit, grossMarginPct, profitabilityIndicator, totalCollected, totalOutstanding, ...data } = req.body;
  const [event] = await db.update(eventsTable).set({ ...data, updatedBy: req.user.id }).where(eq(eventsTable.id, id)).returning();
  if (!event) { res.status(404).json({ error: "Event not found" }); return; }
  const enriched = await getEventWithProfitability(id);
  res.json(enriched);
});

router.delete("/events/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [event] = await db.delete(eventsTable).where(eq(eventsTable.id, id)).returning();
  if (!event) { res.status(404).json({ error: "Event not found" }); return; }
  res.sendStatus(204);
});

// Event Revenue
router.get("/events/:eventId/revenue", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.eventId) ? req.params.eventId[0] : req.params.eventId;
  const eventId = parseInt(raw, 10);
  const [revenue] = await db.select().from(eventRevenueTable).where(eq(eventRevenueTable.eventId, eventId));
  if (!revenue) { res.status(404).json({ error: "Revenue not found" }); return; }
  res.json({
    ...revenue,
    contractValue: parseFloat(String(revenue.contractValue)),
    discount: parseFloat(String(revenue.discount)),
    gst: parseFloat(String(revenue.gst)),
    totalInvoiceValue: parseFloat(String(revenue.totalInvoiceValue)),
    netRevenue: parseFloat(String(revenue.netRevenue)),
    advanceReceived: parseFloat(String(revenue.advanceReceived)),
    secondPayment: parseFloat(String(revenue.secondPayment)),
    finalPayment: parseFloat(String(revenue.finalPayment)),
    totalCollected: parseFloat(String(revenue.totalCollected)),
    outstandingAmount: parseFloat(String(revenue.outstandingAmount)),
  });
});

router.post("/events/:eventId/revenue", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const raw = Array.isArray(req.params.eventId) ? req.params.eventId[0] : req.params.eventId;
  const eventId = parseInt(raw, 10);
  const { contractValue = 0, discount = 0, gst = 0, advanceReceived = 0, secondPayment = 0, finalPayment = 0, ...rest } = req.body;
  const cv = parseFloat(String(contractValue));
  const disc = parseFloat(String(discount));
  const gstAmt = parseFloat(String(gst));
  const advance = parseFloat(String(advanceReceived));
  const second = parseFloat(String(secondPayment));
  const final = parseFloat(String(finalPayment));
  const netRevenue = cv - disc;
  const totalInvoiceValue = cv + gstAmt - disc;
  const totalCollected = advance + second + final;
  const outstandingAmount = Math.max(0, netRevenue - totalCollected);

  const existing = await db.select().from(eventRevenueTable).where(eq(eventRevenueTable.eventId, eventId));
  let result;
  if (existing.length > 0) {
    [result] = await db.update(eventRevenueTable).set({
      contractValue: String(cv), discount: String(disc), gst: String(gstAmt),
      totalInvoiceValue: String(totalInvoiceValue), netRevenue: String(netRevenue),
      advanceReceived: String(advance), secondPayment: String(second), finalPayment: String(final),
      totalCollected: String(totalCollected), outstandingAmount: String(outstandingAmount),
      updatedBy: req.user.id, ...rest,
    }).where(eq(eventRevenueTable.eventId, eventId)).returning();
  } else {
    [result] = await db.insert(eventRevenueTable).values({
      eventId, contractValue: String(cv), discount: String(disc), gst: String(gstAmt),
      totalInvoiceValue: String(totalInvoiceValue), netRevenue: String(netRevenue),
      advanceReceived: String(advance), secondPayment: String(second), finalPayment: String(final),
      totalCollected: String(totalCollected), outstandingAmount: String(outstandingAmount),
      createdBy: req.user.id, ...rest,
    }).returning();
  }
  res.json({ ...result, contractValue: cv, discount: disc, gst: gstAmt, totalInvoiceValue, netRevenue, advanceReceived: advance, secondPayment: second, finalPayment: final, totalCollected, outstandingAmount });
});

// Event Costs
router.get("/events/:eventId/costs", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.eventId) ? req.params.eventId[0] : req.params.eventId;
  const eventId = parseInt(raw, 10);
  const costs = await db.select().from(eventCostsTable).where(eq(eventCostsTable.eventId, eventId)).orderBy(desc(eventCostsTable.createdAt));
  res.json(costs.map(c => ({ ...c, amount: parseFloat(String(c.amount)), gst: parseFloat(String(c.gst)), totalAmount: parseFloat(String(c.totalAmount)) })));
});

router.post("/events/:eventId/costs", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const raw = Array.isArray(req.params.eventId) ? req.params.eventId[0] : req.params.eventId;
  const eventId = parseInt(raw, 10);
  const { category, amount = 0, gst = 0, ...rest } = req.body;
  if (!category) { res.status(400).json({ error: "category is required" }); return; }
  const amt = parseFloat(String(amount));
  const gstAmt = parseFloat(String(gst));
  const totalAmount = amt + gstAmt;
  const [cost] = await db.insert(eventCostsTable).values({ eventId, category, amount: String(amt), gst: String(gstAmt), totalAmount: String(totalAmount), createdBy: req.user.id, ...rest }).returning();
  res.status(201).json({ ...cost, amount: parseFloat(String(cost.amount)), gst: parseFloat(String(cost.gst)), totalAmount: parseFloat(String(cost.totalAmount)) });
});

router.patch("/events/:eventId/costs/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const { amount, gst, ...rest } = req.body;
  const updateData: Record<string, unknown> = { ...rest, updatedBy: req.user.id };
  if (amount !== undefined) {
    const amt = parseFloat(String(amount));
    const gstAmt = parseFloat(String(gst ?? 0));
    updateData.amount = String(amt);
    updateData.gst = String(gstAmt);
    updateData.totalAmount = String(amt + gstAmt);
  }
  const [cost] = await db.update(eventCostsTable).set(updateData).where(eq(eventCostsTable.id, id)).returning();
  if (!cost) { res.status(404).json({ error: "Cost not found" }); return; }
  res.json({ ...cost, amount: parseFloat(String(cost.amount)), gst: parseFloat(String(cost.gst)), totalAmount: parseFloat(String(cost.totalAmount)) });
});

router.delete("/events/:eventId/costs/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [cost] = await db.delete(eventCostsTable).where(eq(eventCostsTable.id, id)).returning();
  if (!cost) { res.status(404).json({ error: "Cost not found" }); return; }
  res.sendStatus(204);
});

export default router;
