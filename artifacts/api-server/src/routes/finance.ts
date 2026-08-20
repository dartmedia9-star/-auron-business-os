import { Router, type IRouter } from "express";
import { eq, desc, sql, and, gte, lte, isNull } from "drizzle-orm";
import { db, operatingExpensesTable, eventsTable, eventRevenueTable } from "@workspace/db";
import { getEventDirectCostTotals } from "../lib/event-financials";

const router: IRouter = Router();

router.get("/finance/summary", async (req, res): Promise<void> => {
  const { year, month } = req.query as Record<string, string>;
  const currentYear = parseInt(year || String(new Date().getFullYear()), 10);

  let eventWhere;
  if (month) {
    const m = parseInt(month, 10);
    const lastDay = new Date(currentYear, m, 0).getDate();
    const fromDate = `${currentYear}-${String(m).padStart(2, "0")}-01`;
    const toDate = `${currentYear}-${String(m).padStart(2, "0")}-${lastDay}`;
    eventWhere = and(gte(eventsTable.eventDate, fromDate), lte(eventsTable.eventDate, toDate));
  } else {
    eventWhere = and(gte(eventsTable.eventDate, `${currentYear}-01-01`), lte(eventsTable.eventDate, `${currentYear}-12-31`));
  }

  const events = await db.select({ id: eventsTable.id }).from(eventsTable).where(eventWhere);
  const eventIds = events.map(e => e.id);
  const allRevenues = await db.select().from(eventRevenueTable);
  const directCostsByEvent = await getEventDirectCostTotals(eventIds);

  const revenues = allRevenues.filter(r => eventIds.includes(r.eventId));

  const revenue = revenues.reduce((s, r) => s + parseFloat(String(r.netRevenue)), 0);
  const directCosts = eventIds.reduce((sum, eventId) => sum + (directCostsByEvent.get(eventId) ?? 0), 0);
  const grossProfit = revenue - directCosts;
  const grossMarginPct = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

  const opexWhere = month
    ? and(eq(operatingExpensesTable.year, currentYear), eq(operatingExpensesTable.month, parseInt(month, 10)))
    : eq(operatingExpensesTable.year, currentYear);
  const opex = await db.select().from(operatingExpensesTable).where(and(opexWhere, isNull(operatingExpensesTable.eventId)));
  const operatingExpenses = opex.reduce((s, e) => s + parseFloat(String(e.amount)), 0);
  const ebitda = grossProfit - operatingExpenses;
  const ebitdaMarginPct = revenue > 0 ? (ebitda / revenue) * 100 : 0;
  const netProfit = ebitda;
  const netMarginPct = revenue > 0 ? (netProfit / revenue) * 100 : 0;

  const totalReceivables = revenues.reduce((s, r) => s + parseFloat(String(r.outstandingAmount)), 0);
  const overdueReceivables = revenues.filter(r => r.paymentStatus === "overdue").reduce((s, r) => s + parseFloat(String(r.outstandingAmount)), 0);

  res.json({ revenue, directCosts, grossProfit, grossMarginPct, operatingExpenses, ebitda, ebitdaMarginPct, netProfit, netMarginPct, totalReceivables, overdueReceivables });
});

router.get("/finance/expenses", async (req, res): Promise<void> => {
  const { year, month, category } = req.query as Record<string, string>;
  const conditions = [];
  if (year) conditions.push(eq(operatingExpensesTable.year, parseInt(year, 10)));
  if (month) conditions.push(eq(operatingExpensesTable.month, parseInt(month, 10)));
  if (category) conditions.push(eq(operatingExpensesTable.category, category));
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const expenses = await db.select().from(operatingExpensesTable).where(where).orderBy(desc(operatingExpensesTable.createdAt));
  res.json(expenses.map(e => ({ ...e, amount: parseFloat(String(e.amount)), gst: parseFloat(String(e.gst)) })));
});

router.post("/finance/expenses", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { category, description, amount, year, month, gst = 0, eventId, ...rest } = req.body;
  if (!category || !description || !amount || !year || !month) { res.status(400).json({ error: "category, description, amount, year, month are required" }); return; }
  const linkedEventId = eventId == null ? null : parseInt(String(eventId), 10);
  if (linkedEventId !== null) {
    if (!Number.isInteger(linkedEventId)) { res.status(400).json({ error: "eventId must be a valid event id" }); return; }
    const [event] = await db.select({ id: eventsTable.id }).from(eventsTable).where(eq(eventsTable.id, linkedEventId));
    if (!event) { res.status(400).json({ error: "Selected event was not found" }); return; }
  }
  const [expense] = await db.insert(operatingExpensesTable).values({ category, description, amount: String(amount), gst: String(gst), year: parseInt(String(year), 10), month: parseInt(String(month), 10), eventId: linkedEventId, ...rest, createdBy: req.user.id }).returning();
  res.status(201).json({ ...expense, amount: parseFloat(String(expense.amount)), gst: parseFloat(String(expense.gst)) });
});

router.patch("/finance/expenses/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const { id: _id, createdAt, updatedAt, eventId, ...data } = req.body;
  const updateData: Record<string, unknown> = data;
  if (eventId !== undefined) {
    const linkedEventId = eventId == null ? null : parseInt(String(eventId), 10);
    if (linkedEventId !== null) {
      if (!Number.isInteger(linkedEventId)) { res.status(400).json({ error: "eventId must be a valid event id" }); return; }
      const [event] = await db.select({ id: eventsTable.id }).from(eventsTable).where(eq(eventsTable.id, linkedEventId));
      if (!event) { res.status(400).json({ error: "Selected event was not found" }); return; }
    }
    updateData.eventId = linkedEventId;
  }
  const [expense] = await db.update(operatingExpensesTable).set(updateData).where(eq(operatingExpensesTable.id, id)).returning();
  if (!expense) { res.status(404).json({ error: "Expense not found" }); return; }
  res.json({ ...expense, amount: parseFloat(String(expense.amount)), gst: parseFloat(String(expense.gst)) });
});

router.delete("/finance/expenses/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [expense] = await db.delete(operatingExpensesTable).where(eq(operatingExpensesTable.id, id)).returning();
  if (!expense) { res.status(404).json({ error: "Expense not found" }); return; }
  res.sendStatus(204);
});

router.get("/finance/receivables", async (req, res): Promise<void> => {
  const revenues = await db.select({ r: eventRevenueTable, e: eventsTable }).from(eventRevenueTable)
    .leftJoin(eventsTable, eq(eventsTable.id, eventRevenueTable.eventId))
    .where(sql`${eventRevenueTable.outstandingAmount} > 0`);

  const today = new Date();
  let totalReceivables = 0, dueToday = 0, dueThisWeek = 0, dueThisMonth = 0;
  let overdue = 0, overdue30 = 0, overdue60 = 0, overdue90 = 0;

  for (const row of revenues) {
    const outstanding = parseFloat(String(row.r.outstandingAmount));
    totalReceivables += outstanding;
    if (row.r.dueDate) {
      const due = new Date(row.r.dueDate);
      const diffDays = Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays === 0) dueToday += outstanding;
      if (diffDays <= 7 && diffDays >= 0) dueThisWeek += outstanding;
      if (diffDays <= 30 && diffDays >= 0) dueThisMonth += outstanding;
      if (diffDays > 0) { overdue += outstanding; if (diffDays > 30) overdue30 += outstanding; if (diffDays > 60) overdue60 += outstanding; if (diffDays > 90) overdue90 += outstanding; }
    }
  }

  const byEvent = revenues.map(row => ({
    eventId: row.r.eventId, eventName: row.e?.name ?? "Unknown",
    outstanding: parseFloat(String(row.r.outstandingAmount)),
    dueDate: row.r.dueDate, paymentStatus: row.r.paymentStatus,
  }));

  res.json({ totalReceivables, dueToday, dueThisWeek, dueThisMonth, overdue, overdue30, overdue60, overdue90, byClient: [], byEvent });
});

export default router;
