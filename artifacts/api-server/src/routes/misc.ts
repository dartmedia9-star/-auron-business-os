import { Router, type IRouter } from "express";
import { eq, desc, and } from "drizzle-orm";
import { db, notificationsTable, companySettingsTable, auditLogsTable, eventsTable, clientsTable, eventRevenueTable } from "@workspace/db";
import { getEventDirectCostTotals } from "../lib/event-financials";

const router: IRouter = Router();

// Notifications
router.get("/notifications", async (req, res): Promise<void> => {
  const { unreadOnly } = req.query as Record<string, string>;
  let notifications = await db.select().from(notificationsTable).orderBy(desc(notificationsTable.createdAt)).limit(50);
  if (unreadOnly === "true") notifications = notifications.filter(n => !n.isRead);
  res.json(notifications);
});

router.patch("/notifications/:id/read", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [notif] = await db.update(notificationsTable).set({ isRead: true }).where(eq(notificationsTable.id, id)).returning();
  if (!notif) { res.status(404).json({ error: "Notification not found" }); return; }
  res.json(notif);
});

router.post("/notifications/read-all", async (req, res): Promise<void> => {
  await db.update(notificationsTable).set({ isRead: true });
  res.json({ success: true });
});

// Settings
router.get("/settings", async (req, res): Promise<void> => {
  let [settings] = await db.select().from(companySettingsTable).limit(1);
  if (!settings) {
    [settings] = await db.insert(companySettingsTable).values({}).returning();
  }
  res.json({
    ...settings,
    gstRate: parseFloat(String(settings.gstRate)),
    excellentMarginThreshold: parseFloat(String(settings.excellentMarginThreshold)),
    healthyMarginThreshold: parseFloat(String(settings.healthyMarginThreshold)),
    warningMarginThreshold: parseFloat(String(settings.warningMarginThreshold)),
    ltvCacTarget: parseFloat(String(settings.ltvCacTarget)),
    cacTarget: settings.cacTarget ? parseFloat(String(settings.cacTarget)) : null,
    valuationTarget: parseFloat(String(settings.valuationTarget)),
  });
});

router.patch("/settings", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { id: _id, updatedAt, ...data } = req.body;
  let [settings] = await db.select().from(companySettingsTable).limit(1);
  if (!settings) {
    [settings] = await db.insert(companySettingsTable).values(data).returning();
  } else {
    [settings] = await db.update(companySettingsTable).set(data).where(eq(companySettingsTable.id, settings.id)).returning();
  }
  res.json({
    ...settings,
    gstRate: parseFloat(String(settings.gstRate)),
    excellentMarginThreshold: parseFloat(String(settings.excellentMarginThreshold)),
    healthyMarginThreshold: parseFloat(String(settings.healthyMarginThreshold)),
    warningMarginThreshold: parseFloat(String(settings.warningMarginThreshold)),
    ltvCacTarget: parseFloat(String(settings.ltvCacTarget)),
    cacTarget: settings.cacTarget ? parseFloat(String(settings.cacTarget)) : null,
    valuationTarget: parseFloat(String(settings.valuationTarget)),
  });
});

// Audit Logs
router.get("/audit-logs", async (req, res): Promise<void> => {
  const { entityType, entityId, page = "1", limit = "50" } = req.query as Record<string, string>;
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;

  const conditions = [];
  if (entityType) conditions.push(eq(auditLogsTable.entityType, entityType));
  if (entityId) conditions.push(eq(auditLogsTable.entityId, parseInt(entityId, 10)));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [logs, total] = await Promise.all([
    db.select().from(auditLogsTable).where(where).orderBy(desc(auditLogsTable.createdAt)).limit(limitNum).offset(offset),
    db.select({ count: desc(auditLogsTable.id) }).from(auditLogsTable).where(where),
  ]);

  res.json({ data: logs, total: logs.length, page: pageNum, limit: limitNum });
});

// Reports
router.get("/reports/event-profitability", async (req, res): Promise<void> => {
  const { fromDate, toDate } = req.query as Record<string, string>;
  const events = await db.select().from(eventsTable);
  const filtered = events.filter(e => {
    if (fromDate && e.eventDate < fromDate) return false;
    if (toDate && e.eventDate > toDate) return false;
    return true;
  });

  const revenues = await db.select().from(eventRevenueTable);
  const directCostsByEvent = await getEventDirectCostTotals(filtered.map(event => event.id));
  const clients = await db.select().from(clientsTable);

  const eventData = filtered.map(ev => {
    const rev = revenues.find(r => r.eventId === ev.id);
    const client = clients.find(c => c.id === ev.clientId);
    const revenue = parseFloat(String(rev?.netRevenue ?? 0));
    const totalCost = directCostsByEvent.get(ev.id) ?? 0;
    const grossProfit = revenue - totalCost;
    const grossMarginPct = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
    let indicator = "awaiting_data";
    if (revenue > 0 || totalCost > 0) {
      if (grossProfit < 0) indicator = "loss";
      else if (grossMarginPct >= 35) indicator = "excellent";
      else if (grossMarginPct >= 20) indicator = "healthy";
      else if (grossMarginPct >= 10) indicator = "warning";
      else indicator = "loss";
    }
    return { id: ev.id, name: ev.name, clientName: client?.name ?? "Unknown", eventType: ev.eventType, eventDate: ev.eventDate, revenue, totalCost, grossProfit, grossMarginPct, indicator };
  });

  const totalRevenue = eventData.reduce((s, e) => s + e.revenue, 0);
  const totalCost = eventData.reduce((s, e) => s + e.totalCost, 0);
  const totalGrossProfit = totalRevenue - totalCost;
  const avgGrossMarginPct = totalRevenue > 0 ? (totalGrossProfit / totalRevenue) * 100 : 0;

  // Group by event type
  const byType: Record<string, typeof eventData> = {};
  for (const ev of eventData) {
    if (!byType[ev.eventType]) byType[ev.eventType] = [];
    byType[ev.eventType].push(ev);
  }
  const byEventType = Object.entries(byType).map(([eventType, evs]) => {
    const typeRevenue = evs.reduce((s, e) => s + e.revenue, 0);
    const typeCost = evs.reduce((s, e) => s + e.totalCost, 0);
    const typeGP = typeRevenue - typeCost;
    return {
      eventType, eventCount: evs.length, totalRevenue: typeRevenue, avgRevenue: evs.length > 0 ? typeRevenue / evs.length : 0,
      totalCost: typeCost, grossProfit: typeGP, avgGrossProfit: evs.length > 0 ? typeGP / evs.length : 0,
      grossMarginPct: typeRevenue > 0 ? (typeGP / typeRevenue) * 100 : 0,
    };
  });

  res.json({ events: eventData, summary: { totalRevenue, totalCost, totalGrossProfit, avgGrossMarginPct, eventCount: eventData.length }, byEventType });
});

router.get("/reports/client-profitability", async (req, res): Promise<void> => {
  const clients = await db.select().from(clientsTable);
  const events = await db.select().from(eventsTable);
  const revenues = await db.select().from(eventRevenueTable);
  const directCostsByEvent = await getEventDirectCostTotals(events.map(event => event.id));

  const clientData = clients.map(client => {
    const clientEvents = events.filter(e => e.clientId === client.id);
    let totalRevenue = 0, totalCost = 0;
    for (const ev of clientEvents) {
      const rev = revenues.find(r => r.eventId === ev.id);
      totalRevenue += parseFloat(String(rev?.netRevenue ?? 0));
      totalCost += directCostsByEvent.get(ev.id) ?? 0;
    }
    const totalGrossProfit = totalRevenue - totalCost;
    const grossMarginPct = totalRevenue > 0 ? (totalGrossProfit / totalRevenue) * 100 : 0;
    return { id: client.id, name: client.name, company: client.company, totalEvents: clientEvents.length, totalRevenue, totalGrossProfit, grossMarginPct, ltv: totalGrossProfit, repeatClient: clientEvents.length > 1 };
  }).sort((a, b) => b.totalGrossProfit - a.totalGrossProfit);

  const totalClients = clients.length;
  const repeatClients = clientData.filter(c => c.repeatClient).length;
  const repeatClientRate = totalClients > 0 ? (repeatClients / totalClients) * 100 : 0;
  const totalRevenue = clientData.reduce((s, c) => s + c.totalRevenue, 0);
  const totalGrossProfit = clientData.reduce((s, c) => s + c.totalGrossProfit, 0);

  res.json({ clients: clientData, summary: { totalClients, repeatClients, repeatClientRate, totalRevenue, totalGrossProfit } });
});

export default router;
