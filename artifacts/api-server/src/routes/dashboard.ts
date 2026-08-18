import { Router, type IRouter } from "express";
import { eq, desc, sql, gte, lte, and } from "drizzle-orm";
import { db, eventsTable, clientsTable, eventRevenueTable, eventCostsTable, leadsTable, operatingExpensesTable, marketingSpendTable, notificationsTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  const { period = "year", year, month } = req.query as Record<string, string>;
  const now = new Date();
  const currentYear = parseInt(year || String(now.getFullYear()), 10);
  const currentMonth = parseInt(month || String(now.getMonth() + 1), 10);

  let fromDate: string;
  let toDate: string;
  if (period === "month") {
    fromDate = `${currentYear}-${String(currentMonth).padStart(2, "0")}-01`;
    const lastDay = new Date(currentYear, currentMonth, 0).getDate();
    toDate = `${currentYear}-${String(currentMonth).padStart(2, "0")}-${lastDay}`;
  } else if (period === "quarter") {
    const q = Math.ceil(currentMonth / 3);
    const qStart = (q - 1) * 3 + 1;
    fromDate = `${currentYear}-${String(qStart).padStart(2, "0")}-01`;
    const qEnd = q * 3;
    const lastDay = new Date(currentYear, qEnd, 0).getDate();
    toDate = `${currentYear}-${String(qEnd).padStart(2, "0")}-${lastDay}`;
  } else {
    fromDate = `${currentYear}-01-01`;
    toDate = `${currentYear}-12-31`;
  }

  const events = await db.select({ event: eventsTable }).from(eventsTable).where(and(gte(eventsTable.eventDate, fromDate), lte(eventsTable.eventDate, toDate)));
  const allEvents = await db.select().from(eventsTable);
  const allRevenues = await db.select().from(eventRevenueTable);
  const allCosts = await db.select().from(eventCostsTable);
  const opex = await db.select().from(operatingExpensesTable).where(and(eq(operatingExpensesTable.year, currentYear)));
  const marketing = await db.select().from(marketingSpendTable);
  const leads = await db.select().from(leadsTable);
  const clients = await db.select().from(clientsTable);

  const eventIds = events.map(e => e.event.id);
  const revenues = allRevenues.filter(r => eventIds.includes(r.eventId));
  const costs = allCosts.filter(c => eventIds.includes(c.eventId));

  const revenue = revenues.reduce((s, r) => s + parseFloat(String(r.netRevenue)), 0);
  const totalCost = costs.reduce((s, c) => s + parseFloat(String(c.totalAmount)), 0);
  const grossProfit = revenue - totalCost;
  const grossMarginPct = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
  const opexTotal = opex.reduce((s, e) => s + parseFloat(String(e.amount)), 0);
  const ebitda = grossProfit - opexTotal;
  const ebitdaMarginPct = revenue > 0 ? (ebitda / revenue) * 100 : 0;
  const netProfit = ebitda;

  const completedEvents = events.filter(e => e.event.status === "completed").length;
  const upcomingEvents = events.filter(e => e.event.status === "upcoming").length;
  const inProgressEvents = events.filter(e => e.event.status === "in_progress").length;
  const cancelledEvents = events.filter(e => e.event.status === "cancelled").length;

  const avgEventValue = eventIds.length > 0 ? revenue / eventIds.length : 0;
  const avgProfitPerEvent = eventIds.length > 0 ? grossProfit / eventIds.length : 0;

  const activeLeads = leads.filter(l => !["won", "lost"].includes(l.status));
  const pipelineValue = activeLeads.reduce((s, l) => s + parseFloat(String(l.expectedValue ?? 0)), 0);
  const weightedPipeline = activeLeads.reduce((s, l) => s + (parseFloat(String(l.expectedValue ?? 0)) * (l.probability ?? 0)) / 100, 0);

  const outstandingReceivables = revenues.reduce((s, r) => s + parseFloat(String(r.outstandingAmount)), 0);

  // Client stats
  const clientEventCounts: Record<number, number> = {};
  for (const e of allEvents) {
    clientEventCounts[e.clientId] = (clientEventCounts[e.clientId] ?? 0) + 1;
  }
  const repeatClients = Object.values(clientEventCounts).filter(c => c > 1).length;
  const totalClients = clients.length;
  const repeatClientRate = totalClients > 0 ? (repeatClients / totalClients) * 100 : 0;

  const wonLeads = leads.filter(l => l.status === "won").length;
  const lostLeads = leads.filter(l => l.status === "lost").length;
  const winRate = (wonLeads + lostLeads) > 0 ? (wonLeads / (wonLeads + lostLeads)) * 100 : 0;

  const marketingTotal = marketing.reduce((s, m) => s + parseFloat(String(m.amount)), 0);
  const customersAcquired = marketing.reduce((s, m) => s + m.customersAcquired, 0);
  const cac = customersAcquired > 0 ? marketingTotal / customersAcquired : null;

  const allClientGrossProfit: Record<number, number> = {};
  for (const r of allRevenues) {
    const evCosts = allCosts.filter(c => c.eventId === r.eventId).reduce((s, c) => s + parseFloat(String(c.totalAmount)), 0);
    const gp = parseFloat(String(r.netRevenue)) - evCosts;
    const ev = allEvents.find(e => e.id === r.eventId);
    if (ev) allClientGrossProfit[ev.clientId] = (allClientGrossProfit[ev.clientId] ?? 0) + gp;
  }
  const avgLtv = Object.values(allClientGrossProfit).length > 0
    ? Object.values(allClientGrossProfit).reduce((s, v) => s + v, 0) / Object.values(allClientGrossProfit).length
    : null;
  const ltv = avgLtv;
  const ltvCacRatio = cac && ltv ? ltv / cac : null;

  // Year over year growth
  const prevYear = currentYear - 1;
  const prevRevenues = await db.select({ netRevenue: eventRevenueTable.netRevenue, eventId: eventRevenueTable.eventId })
    .from(eventRevenueTable)
    .leftJoin(eventsTable, eq(eventsTable.id, eventRevenueTable.eventId))
    .where(and(gte(eventsTable.eventDate, `${prevYear}-01-01`), lte(eventsTable.eventDate, `${prevYear}-12-31`)));
  const prevRevTotal = prevRevenues.reduce((s, r) => s + parseFloat(String(r.netRevenue)), 0);
  const revenueGrowthPct = prevRevTotal > 0 ? ((revenue - prevRevTotal) / prevRevTotal) * 100 : null;

  const newClients = clients.filter(c => {
    const joinDate = c.createdAt;
    return joinDate >= new Date(fromDate) && joinDate <= new Date(toDate);
  }).length;

  res.json({
    revenue, revenueGrowthPct, grossProfit, grossMarginPct, netProfit, ebitda, ebitdaMarginPct,
    events: { total: eventIds.length, completed: completedEvents, upcoming: upcomingEvents, inProgress: inProgressEvents, cancelled: cancelledEvents },
    avgEventValue, avgProfitPerEvent, pipelineValue, weightedPipeline, outstandingReceivables,
    repeatClientRate, cac, ltv, ltvCacRatio, newClients, repeatClients, winRate,
  });
});

router.get("/dashboard/revenue-trend", async (req, res): Promise<void> => {
  const { months = "12" } = req.query as Record<string, string>;
  const monthCount = parseInt(months, 10);
  const now = new Date();
  const result = [];

  for (let i = monthCount - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const fromDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const toDate = `${year}-${String(month).padStart(2, "0")}-${lastDay}`;

    const events = await db.select({ id: eventsTable.id }).from(eventsTable).where(and(gte(eventsTable.eventDate, fromDate), lte(eventsTable.eventDate, toDate)));
    const eventIds = events.map(e => e.id);
    let revenue = 0, grossProfit = 0;

    if (eventIds.length > 0) {
      const revenues = await db.select().from(eventRevenueTable);
      const costs = await db.select().from(eventCostsTable);
      const periodRevs = revenues.filter(r => eventIds.includes(r.eventId));
      const periodCosts = costs.filter(c => eventIds.includes(c.eventId));
      revenue = periodRevs.reduce((s, r) => s + parseFloat(String(r.netRevenue)), 0);
      const totalCost = periodCosts.reduce((s, c) => s + parseFloat(String(c.totalAmount)), 0);
      grossProfit = revenue - totalCost;
    }

    const opex = await db.select().from(operatingExpensesTable).where(and(eq(operatingExpensesTable.year, year), eq(operatingExpensesTable.month, month)));
    const opexTotal = opex.reduce((s, e) => s + parseFloat(String(e.amount)), 0);
    const netProfit = grossProfit - opexTotal;

    result.push({ month, year, revenue, grossProfit, netProfit, events: eventIds.length });
  }

  res.json(result);
});

router.get("/dashboard/event-type-breakdown", async (req, res): Promise<void> => {
  const { year } = req.query as Record<string, string>;
  const currentYear = parseInt(year || String(new Date().getFullYear()), 10);
  const fromDate = `${currentYear}-01-01`;
  const toDate = `${currentYear}-12-31`;

  const events = await db.select().from(eventsTable).where(and(gte(eventsTable.eventDate, fromDate), lte(eventsTable.eventDate, toDate)));
  const allRevenues = await db.select().from(eventRevenueTable);
  const allCosts = await db.select().from(eventCostsTable);

  const byType: Record<string, { eventCount: number; totalRevenue: number; totalCost: number }> = {};
  for (const ev of events) {
    const type = ev.eventType;
    if (!byType[type]) byType[type] = { eventCount: 0, totalRevenue: 0, totalCost: 0 };
    byType[type].eventCount++;
    const rev = allRevenues.find(r => r.eventId === ev.id);
    const costs = allCosts.filter(c => c.eventId === ev.id);
    byType[type].totalRevenue += parseFloat(String(rev?.netRevenue ?? 0));
    byType[type].totalCost += costs.reduce((s, c) => s + parseFloat(String(c.totalAmount)), 0);
  }

  const result = Object.entries(byType).map(([eventType, stats]) => {
    const grossProfit = stats.totalRevenue - stats.totalCost;
    const grossMarginPct = stats.totalRevenue > 0 ? (grossProfit / stats.totalRevenue) * 100 : 0;
    return {
      eventType, eventCount: stats.eventCount,
      totalRevenue: stats.totalRevenue,
      avgRevenue: stats.eventCount > 0 ? stats.totalRevenue / stats.eventCount : 0,
      totalCost: stats.totalCost,
      grossProfit,
      avgGrossProfit: stats.eventCount > 0 ? grossProfit / stats.eventCount : 0,
      grossMarginPct,
    };
  }).sort((a, b) => b.totalRevenue - a.totalRevenue);

  res.json(result);
});

router.get("/dashboard/insights", async (req, res): Promise<void> => {
  const events = await db.select().from(eventsTable);
  const revenues = await db.select().from(eventRevenueTable);
  const costs = await db.select().from(eventCostsTable);
  const leads = await db.select().from(leadsTable);

  const insights = [];

  if (events.length < 2) {
    insights.push({ id: "no-data", type: "info", message: "Not enough data to calculate insights. Add more events to see patterns.", severity: "info", value: null, changeDirection: null });
    res.json(insights);
    return;
  }

  // Best event type by margin
  const byType: Record<string, { rev: number; cost: number; count: number }> = {};
  for (const ev of events) {
    const type = ev.eventType;
    if (!byType[type]) byType[type] = { rev: 0, cost: 0, count: 0 };
    byType[type].count++;
    const rev = revenues.find(r => r.eventId === ev.id);
    const evCosts = costs.filter(c => c.eventId === ev.id);
    byType[type].rev += parseFloat(String(rev?.netRevenue ?? 0));
    byType[type].cost += evCosts.reduce((s, c) => s + parseFloat(String(c.totalAmount)), 0);
  }
  const typeEntries = Object.entries(byType).filter(([_, s]) => s.rev > 0);
  if (typeEntries.length > 0) {
    const bestMarginType = typeEntries.sort((a, b) => ((b[1].rev - b[1].cost) / b[1].rev) - ((a[1].rev - a[1].cost) / a[1].rev))[0];
    const margin = ((bestMarginType[1].rev - bestMarginType[1].cost) / bestMarginType[1].rev * 100).toFixed(1);
    insights.push({ id: "best-type", type: "margin", message: `${bestMarginType[0]} events generate the highest gross margin at ${margin}%.`, severity: "success", value: parseFloat(margin), changeDirection: "up" });
  }

  // Outstanding receivables
  const totalOutstanding = revenues.reduce((s, r) => s + parseFloat(String(r.outstandingAmount)), 0);
  if (totalOutstanding > 0) {
    insights.push({ id: "receivables", type: "receivables", message: `Total outstanding receivables: ₹${(totalOutstanding / 100000).toFixed(1)} lakh. Review overdue accounts.`, severity: totalOutstanding > 500000 ? "warning" : "info", value: totalOutstanding, changeDirection: null });
  }

  // Win rate
  const wonLeads = leads.filter(l => l.status === "won").length;
  const lostLeads = leads.filter(l => l.status === "lost").length;
  if (wonLeads + lostLeads > 0) {
    const winRate = (wonLeads / (wonLeads + lostLeads)) * 100;
    insights.push({ id: "win-rate", type: "pipeline", message: `Current win rate is ${winRate.toFixed(1)}%. ${winRate > 50 ? "Above average performance." : "Consider improving proposal quality."}`, severity: winRate > 50 ? "success" : "warning", value: winRate, changeDirection: winRate > 50 ? "up" : "down" });
  }

  // Follow-ups due
  const today = new Date().toISOString().split("T")[0];
  const overdueFollowups = leads.filter(l => l.followUpDate && l.followUpDate <= today && !["won", "lost"].includes(l.status));
  if (overdueFollowups.length > 0) {
    insights.push({ id: "followups", type: "followup", message: `${overdueFollowups.length} lead follow-up${overdueFollowups.length > 1 ? "s" : ""} overdue. Prioritize outreach to avoid losing opportunities.`, severity: "alert", value: overdueFollowups.length, changeDirection: null });
  }

  res.json(insights);
});

router.get("/search", async (req, res): Promise<void> => {
  const { q, limit = "20" } = req.query as Record<string, string>;
  if (!q) { res.json({ clients: [], events: [], leads: [], vendors: [] }); return; }
  const term = `%${q}%`;
  const [clients, events, leads] = await Promise.all([
    db.select({ id: clientsTable.id, name: clientsTable.name }).from(clientsTable).where(sql`${clientsTable.name} ilike ${term}`).limit(5),
    db.select({ id: eventsTable.id, name: eventsTable.name }).from(eventsTable).where(sql`${eventsTable.name} ilike ${term}`).limit(5),
    db.select({ id: leadsTable.id, name: leadsTable.contactName }).from(leadsTable).where(sql`${leadsTable.contactName} ilike ${term}`).limit(5),
  ]);
  res.json({
    clients: clients.map(c => ({ id: c.id, name: c.name, type: "client" })),
    events: events.map(e => ({ id: e.id, name: e.name, type: "event" })),
    leads: leads.map(l => ({ id: l.id, name: l.name, type: "lead" })),
    vendors: [],
  });
});

export default router;
