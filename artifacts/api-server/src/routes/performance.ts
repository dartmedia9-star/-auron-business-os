import { Router, type IRouter } from "express";
import { eq, desc, sql, and, gte, lte, isNull, asc, inArray } from "drizzle-orm";
import {
  db,
  eventsTable,
  clientsTable,
  eventRevenueTable,
  eventCostsTable,
  operatingExpensesTable,
  fundAccountsTable,
  fundTransactionsTable,
  fundTransfersTable,
  auditLogsTable,
  clientPaymentsTable,
} from "@workspace/db";
import { getEventDirectCostTotals } from "../lib/event-financials";
import { getReceivablesLedger, receivablesForEvents } from "../lib/client-receivables";
import { isInternalTransfer, round2, signedEffect, toMoney } from "../lib/fund-ledger";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// GET /performance/years
// Returns distinct years that have any financial activity (events, expenses,
// or fund transactions). Fully dynamic — no hard-coded years.
// ---------------------------------------------------------------------------
router.get("/performance/years", async (_req, res): Promise<void> => {
  const [eventYears, expenseYears, transferYears] = await Promise.all([
    db
      .selectDistinct({ year: sql<number>`extract(year from ${eventsTable.eventDate})::int` })
      .from(eventsTable),
    db
      .selectDistinct({ year: operatingExpensesTable.year })
      .from(operatingExpensesTable),
    db
      .selectDistinct({ year: sql<number>`extract(year from ${fundTransfersTable.date})::int` })
      .from(fundTransfersTable),
  ]);

  const yearSet = new Set<number>();
  for (const r of eventYears) if (r.year) yearSet.add(r.year);
  for (const r of expenseYears) if (r.year) yearSet.add(r.year);
  for (const r of transferYears) if (r.year) yearSet.add(r.year);

  // Always include current year so the user can plan ahead
  yearSet.add(new Date().getFullYear());

  const years = Array.from(yearSet).sort((a, b) => b - a);
  res.json({ years });
});

// ---------------------------------------------------------------------------
// GET /performance/annual?year=YYYY
// Returns per-month summary for every month in the year. Each month includes:
// revenue, directCosts, grossProfit, grossMarginPct, operatingExpenses,
// ebitda, netProfit, eventCount. Months with zero activity are included with
// zeroes so the UI can always show 12 rows.
// ---------------------------------------------------------------------------
router.get("/performance/annual", async (req, res): Promise<void> => {
  const year = parseInt((req.query.year as string) || String(new Date().getFullYear()), 10);

  const fromDate = `${year}-01-01`;
  const toDate = `${year}-12-31`;

  // Fetch all events in this year
  const yearEvents = await db
    .select({ id: eventsTable.id, eventDate: eventsTable.eventDate })
    .from(eventsTable)
    .where(and(gte(eventsTable.eventDate, fromDate), lte(eventsTable.eventDate, toDate)));

  // Build a map of month → event ids
  const eventsByMonth = new Map<number, number[]>();
  for (const ev of yearEvents) {
    const month = parseInt(ev.eventDate.split("-")[1], 10);
    const list = eventsByMonth.get(month) ?? [];
    list.push(ev.id);
    eventsByMonth.set(month, list);
  }

  // Fetch all revenues and costs for the year
  const allEventIds = yearEvents.map((e) => e.id);
  const [allRevenues, directCostsByEvent] = await Promise.all([
    allEventIds.length > 0
      ? db.select().from(eventRevenueTable).where(inArray(eventRevenueTable.eventId, allEventIds))
      : Promise.resolve([] as any[]),
    getEventDirectCostTotals(allEventIds.length > 0 ? allEventIds : undefined),
  ]);

  // Fetch all operating expenses for the year (only those NOT linked to events)
  const opex = await db
    .select()
    .from(operatingExpensesTable)
    .where(and(eq(operatingExpensesTable.year, year), isNull(operatingExpensesTable.eventId)));

  // Index revenues by eventId
  const revenueByEvent = new Map<number, any>();
  for (const r of allRevenues) revenueByEvent.set(r.eventId, r);

  // Index opex by month
  const opexByMonth = new Map<number, number>();
  for (const e of opex) {
    opexByMonth.set(e.month, (opexByMonth.get(e.month) ?? 0) + toMoney(e.amount));
  }

  const months = [];
  for (let m = 1; m <= 12; m++) {
    const monthEventIds = eventsByMonth.get(m) ?? [];
    const monthRevenues = allRevenues.filter((r) => monthEventIds.includes(r.eventId));

    const revenue = monthRevenues.reduce(
      (s, r) => s + toMoney(r.netRevenue),
      0,
    );
    const directCosts = monthEventIds.reduce(
      (sum, eid) => sum + (directCostsByEvent.get(eid) ?? 0),
      0,
    );
    const grossProfit = revenue - directCosts;
    const grossMarginPct = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
    const operatingExpenses = opexByMonth.get(m) ?? 0;
    const ebitda = grossProfit - operatingExpenses;
    const netProfit = ebitda;

    months.push({
      month: m,
      revenue,
      directCosts,
      grossProfit,
      grossMarginPct,
      operatingExpenses,
      ebitda,
      netProfit,
      eventCount: monthEventIds.length,
    });
  }

  const yearRevenue = months.reduce((s, m) => s + m.revenue, 0);
  const yearDirectCosts = months.reduce((s, m) => s + m.directCosts, 0);
  const yearGrossProfit = months.reduce((s, m) => s + m.grossProfit, 0);
  const yearOpex = months.reduce((s, m) => s + m.operatingExpenses, 0);
  const yearEbitda = months.reduce((s, m) => s + m.ebitda, 0);
  const yearNetProfit = months.reduce((s, m) => s + m.netProfit, 0);
  const yearEventCount = months.reduce((s, m) => s + m.eventCount, 0);

  res.json({
    year,
    months,
    totals: {
      revenue: yearRevenue,
      directCosts: yearDirectCosts,
      grossProfit: yearGrossProfit,
      grossMarginPct: yearRevenue > 0 ? (yearGrossProfit / yearRevenue) * 100 : 0,
      operatingExpenses: yearOpex,
      ebitda: yearEbitda,
      ebitdaMarginPct: yearRevenue > 0 ? (yearEbitda / yearRevenue) * 100 : 0,
      netProfit: yearNetProfit,
      netMarginPct: yearRevenue > 0 ? (yearNetProfit / yearRevenue) * 100 : 0,
      eventCount: yearEventCount,
    },
  });
});

// ---------------------------------------------------------------------------
// Helper: compute full monthly P&L (reuses the exact same logic as
// /finance/summary but scoped to a single month).
// ---------------------------------------------------------------------------
async function computeMonthlyPnL(year: number, month: number) {
  const lastDay = new Date(year, month, 0).getDate();
  const fromDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const toDate = `${year}-${String(month).padStart(2, "0")}-${lastDay}`;

  const [yearEvents, monthExpenses] = await Promise.all([
    db
      .select({ id: eventsTable.id })
      .from(eventsTable)
      .where(and(gte(eventsTable.eventDate, fromDate), lte(eventsTable.eventDate, toDate))),
    db
      .select()
      .from(operatingExpensesTable)
      .where(
        and(
          eq(operatingExpensesTable.year, year),
          eq(operatingExpensesTable.month, month),
        ),
      ),
  ]);

  const eventIds = yearEvents.map((e) => e.id);

  const [allRevenues, directCostsByEvent] = await Promise.all([
    eventIds.length > 0
      ? db.select().from(eventRevenueTable).where(inArray(eventRevenueTable.eventId, eventIds))
      : Promise.resolve([] as any[]),
    getEventDirectCostTotals(eventIds.length > 0 ? eventIds : undefined),
  ]);

  const revenues = allRevenues.filter((r) => eventIds.includes(r.eventId));

  const revenue = revenues.reduce((s, r) => s + toMoney(r.netRevenue), 0);
  const directCosts = eventIds.reduce(
    (sum, eid) => sum + (directCostsByEvent.get(eid) ?? 0),
    0,
  );
  const grossProfit = revenue - directCosts;
  const grossMarginPct = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

  // Operating expenses: total (for the cash-out view) and only non-event-linked (for P&L)
  const allOpex = monthExpenses;
  const opexOnly = allOpex.filter((e) => e.eventId === null);
  const operatingExpenses = opexOnly.reduce((s, e) => s + toMoney(e.amount), 0);
  const totalCashOut = allOpex.reduce((s, e) => s + toMoney(e.amount) + toMoney(e.gst), 0);

  const ebitda = grossProfit - operatingExpenses;
  const ebitdaMarginPct = revenue > 0 ? (ebitda / revenue) * 100 : 0;
  const netProfit = ebitda;
  const netMarginPct = revenue > 0 ? (netProfit / revenue) * 100 : 0;

  // Same receivables calculation as /finance/summary (net of client payments).
  const { total: totalReceivables, overdue: overdueReceivables } = receivablesForEvents(await getReceivablesLedger(), eventIds);

  return {
    year,
    month,
    fromDate,
    toDate,
    revenue,
    directCosts,
    grossProfit,
    grossMarginPct,
    operatingExpenses,
    ebitda,
    ebitdaMarginPct,
    netProfit,
    netMarginPct,
    totalReceivables,
    overdueReceivables,
    eventCount: eventIds.length,
    totalCashOut,
    eventIds,
    allRevenues: revenues,
    allOpex,
    opexOnly,
    directCostsByEvent,
  };
}

// ---------------------------------------------------------------------------
// GET /performance/monthly?year=YYYY&month=MM
// Full monthly performance dashboard.
// ---------------------------------------------------------------------------
router.get("/performance/monthly", async (req, res): Promise<void> => {
  const year = parseInt((req.query.year as string) || String(new Date().getFullYear()), 10);
  const month = parseInt((req.query.month as string) || String(new Date().getMonth() + 1), 10);

  if (month < 1 || month > 12) {
    res.status(400).json({ error: "month must be between 1 and 12" });
    return;
  }

  const pnl = await computeMonthlyPnL(year, month);

  // Fund account balances as of end of selected month (not current all-time).
  // Fund ledger rows count by their effective business date (transaction_date).
  const fundAccounts = await db
    .select()
    .from(fundAccountsTable)
    .orderBy(desc(fundAccountsTable.created_at));
  const fundTxs = await db.select({
    fund_account_id: fundTransactionsTable.fund_account_id,
    transaction_type: fundTransactionsTable.transaction_type,
    amount: fundTransactionsTable.amount,
  }).from(fundTransactionsTable)
    .where(lte(fundTransactionsTable.transaction_date, pnl.toDate));

  const balancesByAccount = new Map<number, number>();
  for (const account of fundAccounts) {
    balancesByAccount.set(account.id, toMoney(account.opening_balance));
  }
  for (const t of fundTxs) {
    balancesByAccount.set(
      t.fund_account_id,
      (balancesByAccount.get(t.fund_account_id) ?? 0) + signedEffect(t.transaction_type, toMoney(t.amount)),
    );
  }

  res.json({
    year: pnl.year,
    month: pnl.month,
    fromDate: pnl.fromDate,
    toDate: pnl.toDate,
    revenue: pnl.revenue,
    directCosts: pnl.directCosts,
    grossProfit: pnl.grossProfit,
    grossMarginPct: pnl.grossMarginPct,
    operatingExpenses: pnl.operatingExpenses,
    ebitda: pnl.ebitda,
    ebitdaMarginPct: pnl.ebitdaMarginPct,
    netProfit: pnl.netProfit,
    netMarginPct: pnl.netMarginPct,
    totalReceivables: pnl.totalReceivables,
    overdueReceivables: pnl.overdueReceivables,
    eventCount: pnl.eventCount,
    totalCashOut: pnl.totalCashOut,
    fundAccounts: fundAccounts.map((a) => ({
      id: a.id,
      name: a.name,
      balance: Math.round((balancesByAccount.get(a.id) ?? 0) * 100) / 100,
    })),
  });
});

// ---------------------------------------------------------------------------
// GET /performance/monthly/revenue?year=YYYY&month=MM
// Revenue records for a specific month (drill-down from Revenue KPI).
// ---------------------------------------------------------------------------
router.get("/performance/monthly/revenue", async (req, res): Promise<void> => {
  const year = parseInt((req.query.year as string) || String(new Date().getFullYear()), 10);
  const month = parseInt((req.query.month as string) || "1", 10);

  const lastDay = new Date(year, month, 0).getDate();
  const fromDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const toDate = `${year}-${String(month).padStart(2, "0")}-${lastDay}`;

  const monthEvents = await db
    .select({ id: eventsTable.id })
    .from(eventsTable)
    .where(and(gte(eventsTable.eventDate, fromDate), lte(eventsTable.eventDate, toDate)));

  const eventIds = monthEvents.map((e) => e.id);
  if (eventIds.length === 0) {
    res.json({ revenue: [], total: 0 });
    return;
  }

  const revenueRows = await db
    .select({
      revenue: eventRevenueTable,
      eventName: eventsTable.name,
      eventDate: eventsTable.eventDate,
      eventType: eventsTable.eventType,
      clientName: clientsTable.name,
      clientId: eventsTable.clientId,
    })
    .from(eventRevenueTable)
    .innerJoin(eventsTable, eq(eventsTable.id, eventRevenueTable.eventId))
    .leftJoin(clientsTable, eq(clientsTable.id, eventsTable.clientId))
    .where(inArray(eventRevenueTable.eventId, eventIds))
    .orderBy(desc(eventsTable.eventDate));

  const result = revenueRows.map((r) => ({
    eventId: r.revenue.eventId,
    eventName: r.eventName,
    eventDate: r.eventDate,
    eventType: r.eventType,
    clientName: r.clientName,
    clientId: r.clientId,
    contractValue: toMoney(r.revenue.contractValue),
    discount: toMoney(r.revenue.discount),
    gst: toMoney(r.revenue.gst),
    netRevenue: toMoney(r.revenue.netRevenue),
    totalCollected: toMoney(r.revenue.totalCollected),
    outstandingAmount: toMoney(r.revenue.outstandingAmount),
    paymentStatus: r.revenue.paymentStatus,
    invoiceNumber: r.revenue.invoiceNumber,
    dueDate: r.revenue.dueDate,
  }));

  const total = result.reduce((s, r) => s + r.netRevenue, 0);
  res.json({ revenue: result, total });
});

// ---------------------------------------------------------------------------
// GET /performance/monthly/expenses?year=YYYY&month=MM
// Expense records for a specific month (drill-down from Expenses KPI).
// ---------------------------------------------------------------------------
router.get("/performance/monthly/expenses", async (req, res): Promise<void> => {
  const year = parseInt((req.query.year as string) || String(new Date().getFullYear()), 10);
  const month = parseInt((req.query.month as string) || "1", 10);

  const expenses = await db
    .select()
    .from(operatingExpensesTable)
    .where(and(eq(operatingExpensesTable.year, year), eq(operatingExpensesTable.month, month)))
    .orderBy(desc(operatingExpensesTable.createdAt));

  // Resolve event names for linked expenses
  const linkedEventIds = [...new Set(expenses.map((e) => e.eventId).filter((id): id is number => id !== null))];
  let eventNameMap = new Map<number, string>();
  if (linkedEventIds.length > 0) {
    const linkedEvents = await db
      .select({ id: eventsTable.id, name: eventsTable.name })
      .from(eventsTable)
      .where(inArray(eventsTable.id, linkedEventIds));
    for (const ev of linkedEvents) eventNameMap.set(ev.id, ev.name);
  }

  const result = expenses.map((e) => ({
    id: e.id,
    category: e.category,
    description: e.description,
    amount: toMoney(e.amount),
    gst: toMoney(e.gst),
    cashOut: toMoney(e.amount) + toMoney(e.gst),
    year: e.year,
    month: e.month,
    date: e.date,
    referenceNumber: e.referenceNumber,
    eventId: e.eventId,
    eventName: e.eventId ? eventNameMap.get(e.eventId) ?? null : null,
    paidBy: e.paidBy,
    paymentMethod: e.paymentMethod,
    createdBy: e.createdBy,
    createdAt: e.createdAt,
  }));

  const totalAmount = result.reduce((s, e) => s + e.amount, 0);
  const totalGst = result.reduce((s, e) => s + e.gst, 0);
  const totalCashOut = result.reduce((s, e) => s + e.cashOut, 0);

  // Category breakdown
  const byCategory: Record<string, { count: number; total: number }> = {};
  for (const e of result) {
    if (!byCategory[e.category]) byCategory[e.category] = { count: 0, total: 0 };
    byCategory[e.category].count++;
    byCategory[e.category].total += e.amount;
  }

  // Payer breakdown
  const byPayer: Record<string, { count: number; total: number }> = {};
  for (const e of result) {
    const payer = e.paidBy || "Unspecified";
    if (!byPayer[payer]) byPayer[payer] = { count: 0, total: 0 };
    byPayer[payer].count++;
    byPayer[payer].total += e.amount;
  }

  res.json({
    expenses: result,
    totalAmount,
    totalGst,
    totalCashOut,
    count: result.length,
    byCategory: Object.entries(byCategory).map(([category, stats]) => ({ category, ...stats })),
    byPayer: Object.entries(byPayer).map(([payer, stats]) => ({ payer, ...stats })),
  });
});

// ---------------------------------------------------------------------------
// GET /performance/monthly/profitability?year=YYYY&month=MM
// Event profitability for a specific month (drill-down from Gross Profit KPI).
// ---------------------------------------------------------------------------
router.get("/performance/monthly/profitability", async (req, res): Promise<void> => {
  const year = parseInt((req.query.year as string) || String(new Date().getFullYear()), 10);
  const month = parseInt((req.query.month as string) || "1", 10);

  const lastDay = new Date(year, month, 0).getDate();
  const fromDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const toDate = `${year}-${String(month).padStart(2, "0")}-${lastDay}`;

  const monthEvents = await db
    .select({ event: eventsTable, clientName: clientsTable.name })
    .from(eventsTable)
    .leftJoin(clientsTable, eq(clientsTable.id, eventsTable.clientId))
    .where(and(gte(eventsTable.eventDate, fromDate), lte(eventsTable.eventDate, toDate)))
    .orderBy(desc(eventsTable.eventDate));

  const eventIds = monthEvents.map((r) => r.event.id);
  if (eventIds.length === 0) {
    res.json({ events: [], totalRevenue: 0, totalCost: 0, totalProfit: 0 });
    return;
  }

  const [allRevenues, directCostsByEvent] = await Promise.all([
    db.select().from(eventRevenueTable).where(inArray(eventRevenueTable.eventId, eventIds)),
    getEventDirectCostTotals(eventIds),
  ]);

  const revenueByEvent = new Map<number, any>();
  for (const r of allRevenues) revenueByEvent.set(r.eventId, r);

  const events = monthEvents.map((row) => {
    const rev = revenueByEvent.get(row.event.id);
    const revenue = rev ? toMoney(rev.netRevenue) : 0;
    const cost = directCostsByEvent.get(row.event.id) ?? 0;
    const profit = revenue - cost;
    const marginPct = revenue > 0 ? (profit / revenue) * 100 : 0;

    return {
      eventId: row.event.id,
      eventName: row.event.name,
      eventDate: row.event.eventDate,
      eventType: row.event.eventType,
      status: row.event.status,
      clientName: row.clientName,
      clientId: row.event.clientId,
      revenue,
      directCost: cost,
      profit,
      marginPct,
      outstandingAmount: rev ? toMoney(rev.outstandingAmount) : 0,
    };
  });

  const totalRevenue = events.reduce((s, e) => s + e.revenue, 0);
  const totalCost = events.reduce((s, e) => s + e.directCost, 0);
  const totalProfit = totalRevenue - totalCost;

  res.json({ events, totalRevenue, totalCost, totalProfit });
});

// ---------------------------------------------------------------------------
// GET /performance/monthly/events?year=YYYY&month=MM
// Events list for a specific month.
// ---------------------------------------------------------------------------
router.get("/performance/monthly/events", async (req, res): Promise<void> => {
  const year = parseInt((req.query.year as string) || String(new Date().getFullYear()), 10);
  const month = parseInt((req.query.month as string) || "1", 10);

  const lastDay = new Date(year, month, 0).getDate();
  const fromDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const toDate = `${year}-${String(month).padStart(2, "0")}-${lastDay}`;

  const monthEvents = await db
    .select({ event: eventsTable, clientName: clientsTable.name })
    .from(eventsTable)
    .leftJoin(clientsTable, eq(clientsTable.id, eventsTable.clientId))
    .where(and(gte(eventsTable.eventDate, fromDate), lte(eventsTable.eventDate, toDate)))
    .orderBy(desc(eventsTable.eventDate));

  const eventIds = monthEvents.map((r) => r.event.id);

  const [allRevenues, directCostsByEvent] = await Promise.all([
    eventIds.length > 0
      ? db.select().from(eventRevenueTable).where(inArray(eventRevenueTable.eventId, eventIds))
      : Promise.resolve([] as any[]),
    getEventDirectCostTotals(eventIds.length > 0 ? eventIds : undefined),
  ]);

  const revenueByEvent = new Map<number, any>();
  for (const r of allRevenues) revenueByEvent.set(r.eventId, r);

  const events = monthEvents.map((row) => {
    const rev = revenueByEvent.get(row.event.id);
    const revenue = rev ? toMoney(rev.netRevenue) : 0;
    const cost = directCostsByEvent.get(row.event.id) ?? 0;
    const profit = revenue - cost;
    const marginPct = revenue > 0 ? (profit / revenue) * 100 : 0;

    return {
      id: row.event.id,
      name: row.event.name,
      eventDate: row.event.eventDate,
      eventType: row.event.eventType,
      status: row.event.status,
      venue: row.event.venue,
      clientName: row.clientName,
      clientId: row.event.clientId,
      revenue,
      directCost: cost,
      profit,
      marginPct,
      totalCollected: rev ? toMoney(rev.totalCollected) : 0,
      outstandingAmount: rev ? toMoney(rev.outstandingAmount) : 0,
    };
  });

  res.json({ events, count: events.length });
});

// ---------------------------------------------------------------------------
// GET /performance/monthly/cashflow?year=YYYY&month=MM
// Fund activity (cash in/out) for a specific month. Internal transfers are
// shown but clearly labeled as non-P&L.
// ---------------------------------------------------------------------------
router.get("/performance/monthly/cashflow", async (req, res): Promise<void> => {
  const year = parseInt((req.query.year as string) || String(new Date().getFullYear()), 10);
  const month = parseInt((req.query.month as string) || "1", 10);

  const lastDay = new Date(year, month, 0).getDate();
  const fromDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const toDate = `${year}-${String(month).padStart(2, "0")}-${lastDay}`;

  // Fund ledger rows are bucketed by their effective business date
  // (payment / expense / transfer date), not by when they were entered.
  const fundTxs = await db
    .select({
      id: fundTransactionsTable.id,
      fund_account_id: fundTransactionsTable.fund_account_id,
      transaction_type: fundTransactionsTable.transaction_type,
      amount: fundTransactionsTable.amount,
      description: fundTransactionsTable.description,
      transaction_date: fundTransactionsTable.transaction_date,
      related_client_payment_id: fundTransactionsTable.related_client_payment_id,
      created_at: fundTransactionsTable.created_at,
      created_by: fundTransactionsTable.created_by,
    })
    .from(fundTransactionsTable)
    .where(
      and(
        gte(fundTransactionsTable.transaction_date, fromDate),
        lte(fundTransactionsTable.transaction_date, toDate),
      ),
    )
    .orderBy(desc(fundTransactionsTable.transaction_date), desc(fundTransactionsTable.created_at), desc(fundTransactionsTable.id));

  // Fund transfers in this month
  const transfers = await db
    .select()
    .from(fundTransfersTable)
    .where(and(gte(fundTransfersTable.date, fromDate), lte(fundTransfersTable.date, toDate)))
    .orderBy(desc(fundTransfersTable.date));

  // Fund accounts for name resolution
  const accounts = await db.select().from(fundAccountsTable);
  const accountMap = new Map<number, string>();
  for (const a of accounts) accountMap.set(a.id, a.name);

  // Every ledger row stays listed; transfers are flagged as internal so the UI
  // can show them as "Internal Transfer" rather than cash in/out.
  const transactions = fundTxs.map((t) => {
    const amount = toMoney(t.amount);
    const effect = signedEffect(t.transaction_type, amount);
    return {
      id: t.id,
      accountId: t.fund_account_id,
      accountName: accountMap.get(t.fund_account_id) ?? "Unknown",
      type: t.transaction_type,
      amount,
      moneyIn: effect > 0 ? effect : 0,
      moneyOut: effect < 0 ? -effect : 0,
      isInternalTransfer: isInternalTransfer(t.transaction_type),
      relatedClientPaymentId: t.related_client_payment_id,
      description: t.description,
      transactionDate: t.transaction_date,
      createdAt: t.created_at,
      createdBy: t.created_by,
    };
  });

  const transferList = transfers.map((t) => ({
    id: t.id,
    fromAccount: accountMap.get(t.from_account_id) ?? "Unknown",
    toAccount: accountMap.get(t.to_account_id) ?? "Unknown",
    amount: toMoney(t.amount),
    date: t.date,
    description: t.description,
    createdBy: t.created_by,
  }));

  // Business cash in/out excludes transfers: moving money between the
  // company's own funds is neither cash received nor cash spent.
  const cashRows = transactions.filter((t) => !t.isInternalTransfer);
  const totalCashIn = round2(cashRows.reduce((s, t) => s + t.moneyIn, 0));
  const totalCashOut = round2(cashRows.reduce((s, t) => s + t.moneyOut, 0));
  const totalTransfers = round2(transferList.reduce((s, t) => s + t.amount, 0));

  // Client payments are a distinct inflow category (cash collection, not P&L
  // revenue), counted from the ledger by payment date.
  const clientPaymentTotal = round2(transactions.filter((t) => t.type === "client_payment").reduce((s, t) => s + t.moneyIn, 0));
  const clientPaymentReversalTotal = round2(transactions.filter((t) => t.type === "client_payment_reversal").reduce((s, t) => s + t.moneyOut, 0));
  const netClientReceipts = round2(clientPaymentTotal - clientPaymentReversalTotal);
  const otherInflows = round2(totalCashIn - clientPaymentTotal);

  // The client-payment records dated in this month, for listing.
  const payments = await db
    .select({
      id: clientPaymentsTable.id,
      clientId: clientPaymentsTable.clientId,
      clientName: clientsTable.name,
      amount: clientPaymentsTable.amount,
      paymentDate: clientPaymentsTable.paymentDate,
      fundAccountId: clientPaymentsTable.fundAccountId,
      paymentMethod: clientPaymentsTable.paymentMethod,
      reference: clientPaymentsTable.reference,
    })
    .from(clientPaymentsTable)
    .leftJoin(clientsTable, eq(clientsTable.id, clientPaymentsTable.clientId))
    .where(and(gte(clientPaymentsTable.paymentDate, fromDate), lte(clientPaymentsTable.paymentDate, toDate)))
    .orderBy(desc(clientPaymentsTable.paymentDate), desc(clientPaymentsTable.id));

  res.json({
    transactions,
    transfers: transferList,
    totalCashIn,
    totalCashOut,
    netCashFlow: round2(totalCashIn - totalCashOut),
    totalTransfers,
    transactionCount: transactions.length,
    transferCount: transferList.length,
    clientPaymentTotal,
    clientPaymentReversalTotal,
    netClientReceipts,
    otherInflows,
    clientPayments: payments.map((p) => ({
      id: p.id,
      clientId: p.clientId,
      clientName: p.clientName,
      amount: toMoney(p.amount),
      paymentDate: p.paymentDate,
      fundAccountId: p.fundAccountId,
      fundAccountName: accountMap.get(p.fundAccountId) ?? null,
      paymentMethod: p.paymentMethod,
      reference: p.reference,
    })),
  });
});

// ---------------------------------------------------------------------------
// GET /performance/monthly/activity?year=YYYY&month=MM
// Audit logs for a specific month.
// ---------------------------------------------------------------------------
router.get("/performance/monthly/activity", async (req, res): Promise<void> => {
  const year = parseInt((req.query.year as string) || String(new Date().getFullYear()), 10);
  const month = parseInt((req.query.month as string) || "1", 10);

  const lastDay = new Date(year, month, 0).getDate();
  const fromDate = new Date(`${year}-${String(month).padStart(2, "0")}-01`);
  const toDate = new Date(`${year}-${String(month).padStart(2, "0")}-${lastDay}T23:59:59.999Z`);

  const logs = await db
    .select()
    .from(auditLogsTable)
    .where(and(gte(auditLogsTable.createdAt, fromDate), lte(auditLogsTable.createdAt, toDate)))
    .orderBy(desc(auditLogsTable.createdAt));

  res.json({ logs, count: logs.length });
});

export default router;
