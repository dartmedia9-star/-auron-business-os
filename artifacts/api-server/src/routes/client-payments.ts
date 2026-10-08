import { Router, type IRouter } from "express";
import { eq, desc, sql, and, gte, lte, ilike, or, inArray, sum } from "drizzle-orm";
import {
  db,
  auditLogsTable,
  clientPaymentsTable,
  paymentAllocationsTable,
  clientsTable,
  eventsTable,
  eventRevenueTable,
  fundAccountsTable,
  fundTransactionsTable,
} from "@workspace/db";

const router: IRouter = Router();

function toMoney(value: unknown): number {
  const n = parseFloat(String(value));
  return Number.isFinite(n) ? n : 0;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// A payment allocations helper: given a payment, returns its total allocated amount.
async function getAllocatedTotal(paymentId: number): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`COALESCE(SUM(${paymentAllocationsTable.amount}), 0)` })
    .from(paymentAllocationsTable)
    .where(eq(paymentAllocationsTable.paymentId, paymentId));
  return toMoney(row?.total ?? 0);
}

// Computes the client-level receivable using BOTH:
//  - legacy event-level collected amounts (event_revenue.totalCollected) for
//    historical data
//  - new client-level payments (client_payments.amount)
// Because legacy payments and new payments are distinct historical phases, the
// client-level "received" is the max of the two views: the legacy event-level
// collected total predates the client_payments table, and new payments only
// exist in client_payments. To avoid double counting when both exist for the
// same event, we treat them additively: legacy receipts represent events
// collected before the client payments feature, and any new payments are
// recorded separately going forward. Realistically an event will only ever be
// settled through one of the two mechanisms at a time.
async function computeClientReceivables(clientId: number) {
  const events = await db
    .select({ id: eventsTable.id })
    .from(eventsTable)
    .where(eq(eventsTable.clientId, clientId));
  const eventIds = events.map((e) => e.id);

  const [revenues, payments] = await Promise.all([
    eventIds.length > 0
      ? db.select().from(eventRevenueTable).where(inArray(eventRevenueTable.eventId, eventIds))
      : Promise.resolve([] as any[]),
    db.select().from(clientPaymentsTable).where(eq(clientPaymentsTable.clientId, clientId)),
  ]);

  const totalBilled = revenues.reduce((s, r) => s + toMoney(r.netRevenue), 0);

  // Legacy collected: historical event-level totalCollected.
  const legacyCollected = revenues.reduce((s, r) => s + toMoney(r.totalCollected), 0);

  // NEW client-level payments.
  const newReceived = payments.reduce((s, p) => s + toMoney(p.amount), 0);

  // Client-level "received" is legacy collected + new payments.
  const totalReceived = legacyCollected + newReceived;

  // Outstanding cannot be negative. Excess becomes credit/advance.
  let outstanding = round2(totalBilled - totalReceived);
  let credit = 0;
  if (outstanding < 0) {
    credit = round2(-outstanding);
    outstanding = 0;
  }

  // Unallocated amount across all client payments (sum of full payments minus
  // what's been allocated to events).
  let unallocated = 0;
  for (const p of payments) {
    const allocated = await getAllocatedTotal(p.id);
    unallocated += toMoney(p.amount) - allocated;
  }
  unallocated = round2(unallocated);

  return {
    clientId,
    totalBilled: round2(totalBilled),
    legacyCollected: round2(legacyCollected),
    totalReceived: round2(totalReceived),
    newReceived: round2(newReceived),
    outstanding,
    credit,
    unallocated: round2(unallocated),
  };
}

// ---------------------------------------------------------------------------
// Client receivable summary
// ---------------------------------------------------------------------------

// GET /clients/:id/receivables
router.get("/clients/:id/receivables", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, id));
  if (!client) { res.status(404).json({ error: "Client not found" }); return; }
  const receivables = await computeClientReceivables(id);

  // Event-level view: underlying events with revenue and (where present) allocated amounts.
  const events = await db
    .select({ id: eventsTable.id, name: eventsTable.name, eventDate: eventsTable.eventDate, clientId: eventsTable.clientId })
    .from(eventsTable)
    .where(eq(eventsTable.clientId, id));
  const eventIds = events.map((e) => e.id);
  const revenues = eventIds.length > 0
    ? await db.select().from(eventRevenueTable).where(inArray(eventRevenueTable.eventId, eventIds))
    : [];
  const payments = await db.select().from(clientPaymentsTable).where(eq(clientPaymentsTable.clientId, id));
  const paymentIds = payments.map((p) => p.id);
  const allocRows = paymentIds.length > 0
    ? await db.select().from(paymentAllocationsTable).where(inArray(paymentAllocationsTable.paymentId, paymentIds))
    : [];

  const allocatedByEvent = new Map<number, number>();
  for (const a of allocRows) {
    allocatedByEvent.set(a.eventId, (allocatedByEvent.get(a.eventId) ?? 0) + toMoney(a.amount));
  }

  const eventRows = events.map((ev) => {
    const rev = revenues.find((r) => r.eventId === ev.id);
    const netRevenue = rev ? toMoney(rev.netRevenue) : 0;
    const legacyCollected = rev ? toMoney(rev.totalCollected) : 0;
    const allocated = allocatedByEvent.get(ev.id) ?? 0;
    const effectiveCollected = legacyCollected + allocated;
    return {
      eventId: ev.id,
      eventName: ev.name,
      eventDate: ev.eventDate,
      revenue: netRevenue,
      legacyCollected,
      allocated,
      outstanding: round2(Math.max(0, netRevenue - effectiveCollected)),
    };
  });

  res.json({ client: { id: client.id, name: client.name }, ...receivables, events: eventRows });
});

// GET /finance/client-receivables — all clients' receivable summaries
router.get("/finance/client-receivables", async (req, res): Promise<void> => {
  const { search, page = "1", limit = "50", fromDate, toDate } = req.query as Record<string, string>;
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;

  const conditions = [];
  if (search) {
    conditions.push(sql`(${ilike(clientsTable.name, `%${search}%`)} OR ${ilike(clientsTable.company, `%${search}%`)})`);
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [clients, totalResult] = await Promise.all([
    db.select().from(clientsTable).where(where).orderBy(desc(clientsTable.createdAt)).limit(limitNum).offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(clientsTable).where(where),
  ]);

  const enriched = [];
  for (const c of clients) {
    const r = await computeClientReceivables(c.id);
    enriched.push({ ...c, ...r });
  }

  res.json({ data: enriched, total: totalResult[0]?.count ?? 0, page: pageNum, limit: limitNum });
});

// ---------------------------------------------------------------------------
// Client payments
// ---------------------------------------------------------------------------

// GET /clients/:id/payments — list payments for a client (paginated)
router.get("/clients/:id/payments", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const { page = "1", limit = "50", fromDate, toDate, fundAccountId } = req.query as Record<string, string>;
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;

  const conditions = [eq(clientPaymentsTable.clientId, id)];
  if (fromDate) conditions.push(gte(clientPaymentsTable.paymentDate, fromDate));
  if (toDate) conditions.push(lte(clientPaymentsTable.paymentDate, toDate));
  if (fundAccountId) conditions.push(eq(clientPaymentsTable.fundAccountId, parseInt(fundAccountId, 10)));

  const where = and(...conditions);

  const [payments, totalResult] = await Promise.all([
    db.select().from(clientPaymentsTable).where(where).orderBy(desc(clientPaymentsTable.paymentDate)).limit(limitNum).offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(clientPaymentsTable).where(where),
  ]);

  // Resolve fund account names + allocations per payment.
  const fundAccounts = await db.select().from(fundAccountsTable);
  const accountMap = new Map<number, string>();
  for (const a of fundAccounts) accountMap.set(a.id, a.name);

  const paymentIds = payments.map((p) => p.id);
  const allocRows = paymentIds.length > 0
    ? await db.select().from(paymentAllocationsTable).where(inArray(paymentAllocationsTable.paymentId, paymentIds))
    : [];
  const allocByPayment = new Map<number, typeof allocRows>();
  for (const a of allocRows) {
    const list = allocByPayment.get(a.paymentId) ?? [];
    list.push(a);
    allocByPayment.set(a.paymentId, list);
  }

  const data = payments.map((p) => {
    const allocs = allocByPayment.get(p.id) ?? [];
    const allocatedTotal = allocs.reduce((s, a) => s + toMoney(a.amount), 0);
    return {
      ...p,
      amount: toMoney(p.amount),
      allocated: round2(allocatedTotal),
      unallocated: round2(toMoney(p.amount) - allocatedTotal),
      fundAccountName: accountMap.get(p.fundAccountId) ?? "Unknown",
    };
  });

  res.json({ data, total: totalResult[0]?.count ?? 0, page: pageNum, limit: limitNum });
});

// POST /clients/:id/payments — record a new payment
router.post("/clients/:id/payments", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const clientId = parseInt(raw, 10);

  const { amount, payment_date, fund_account_id, payment_method, reference, notes, allocations } = req.body ?? {};

  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, clientId));
  if (!client) { res.status(400).json({ error: "Client not found" }); return; }

  const amountNum = toMoney(amount);
  if (amountNum <= 0) { res.status(400).json({ error: "amount must be greater than zero" }); return; }
  if (!payment_date) { res.status(400).json({ error: "payment_date is required" }); return; }

  const [fundAccount] = await db.select().from(fundAccountsTable).where(eq(fundAccountsTable.id, parseInt(String(fund_account_id), 10)));
  if (!fundAccount) { res.status(400).json({ error: "fund_account_id must reference a valid fund account" }); return; }

  // Validate allocation payload (optional).
  let allocationRows: Array<{ eventId: number; amount: number }> = [];
  if (allocations && Array.isArray(allocations) && allocations.length > 0) {
    // All allocated events must belong to this client.
    const eventIds = allocations.map((a: any) => parseInt(String(a?.eventId), 10)).filter((n: number) => Number.isInteger(n));
    const events = eventIds.length > 0
      ? await db.select().from(eventsTable).where(inArray(eventsTable.id, eventIds))
      : [];
    const eventMap = new Map<number, any>();
    for (const e of events) eventMap.set(e.id, e);

    let allocTotal = 0;
    for (const a of allocations) {
      const eventId = parseInt(String(a?.eventId), 10);
      const amt = toMoney(a?.amount);
      const ev = eventMap.get(eventId);
      if (!ev) { res.status(400).json({ error: `Event ${eventId} was not found` }); return; }
      if (ev.clientId !== clientId) { res.status(400).json({ error: `Event ${eventId} does not belong to this client` }); return; }
      if (amt <= 0) { res.status(400).json({ error: "Allocation amount must be greater than zero" }); return; }
      allocTotal += amt;
      allocationRows.push({ eventId, amount: amt });
    }
    if (round2(allocTotal) > round2(amountNum)) {
      res.status(400).json({ error: "Total allocation exceeds payment amount" }); return;
    }
  }

  // All validation passed. Commit payment + fund transaction (+ allocations) atomically.
  const created = await db.transaction(async (tx) => {
    const [payment] = await tx.insert(clientPaymentsTable).values({
      clientId,
      amount: String(amountNum),
      paymentDate: payment_date,
      fundAccountId: fundAccount.id,
      paymentMethod: payment_method || null,
      reference: reference || null,
      notes: notes || null,
      createdBy: req.user.id,
    }).returning();

    // Create the fund ledger entry (cash collection → fund balance increase).
    await tx.insert(fundTransactionsTable).values({
      fund_account_id: fundAccount.id,
      transaction_type: "client_payment",
      amount: String(amountNum),
      description: `Client payment from ${client.name}`,
      created_by: req.user.id,
    });

    for (const a of allocationRows) {
      await tx.insert(paymentAllocationsTable).values({
        paymentId: payment.id,
        eventId: a.eventId,
        amount: String(a.amount),
      });
    }

    await tx.insert(auditLogsTable).values({
      userId: req.user.id,
      userEmail: req.user.email ?? null,
      action: "create",
      entityType: "client_payment",
      entityId: payment.id,
      newValues: { ...payment, amount: amountNum, allocations: allocationRows },
    });

    return payment;
  });

  const allocated = await getAllocatedTotal(created.id);
  res.status(201).json({ ...created, amount: toMoney(created.amount), allocated: round2(allocated), unallocated: round2(toMoney(created.amount) - allocated) });
});

// GET /payments/:id — single payment with allocations
router.get("/payments/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [payment] = await db.select().from(clientPaymentsTable).where(eq(clientPaymentsTable.id, id));
  if (!payment) { res.status(404).json({ error: "Payment not found" }); return; }

  const [client, fundAccount] = await Promise.all([
    db.select().from(clientsTable).where(eq(clientsTable.id, payment.clientId)),
    db.select().from(fundAccountsTable).where(eq(fundAccountsTable.id, payment.fundAccountId)),
  ]);
  const allocations = await db.select().from(paymentAllocationsTable).where(eq(paymentAllocationsTable.paymentId, id));

  const allocatedTotal = allocations.reduce((s, a) => s + toMoney(a.amount), 0);
  res.json({
    ...payment,
    amount: toMoney(payment.amount),
    clientName: client[0]?.name ?? "Unknown",
    fundAccountName: fundAccount[0]?.name ?? "Unknown",
    allocations: allocations.map((a) => ({ ...a, amount: toMoney(a.amount) })),
    allocated: round2(allocatedTotal),
    unallocated: round2(toMoney(payment.amount) - allocatedTotal),
  });
});

// PATCH /payments/:id — update payment (amount/date/fund/method/reference/notes)
router.patch("/payments/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const { amount, payment_date, fund_account_id, payment_method, reference, notes, id: _id, createdAt, updatedAt, ..._rest } = req.body ?? {};

  const [payment] = await db.select().from(clientPaymentsTable).where(eq(clientPaymentsTable.id, id));
  if (!payment) { res.status(404).json({ error: "Payment not found" }); return; }

  const updateData: Record<string, unknown> = { updatedBy: req.user.id };

  let newAmount = toMoney(payment.amount);
  let newFundId = payment.fundAccountId;
  let newPaymentDate = payment.paymentDate;

  if (amount !== undefined) {
    const amt = toMoney(amount);
    if (amt <= 0) { res.status(400).json({ error: "amount must be greater than zero" }); return; }
    newAmount = amt;
    updateData.amount = String(amt);
  }
  if (payment_date !== undefined) {
    if (!payment_date) { res.status(400).json({ error: "payment_date cannot be empty" }); return; }
    newPaymentDate = payment_date;
    updateData.paymentDate = payment_date;
  }
  if (fund_account_id !== undefined) {
    const fid = parseInt(String(fund_account_id), 10);
    const [acc] = await db.select().from(fundAccountsTable).where(eq(fundAccountsTable.id, fid));
    if (!acc) { res.status(400).json({ error: "fund_account_id must reference a valid fund account" }); return; }
    newFundId = fid;
    updateData.fundAccountId = fid;
  }
  if (payment_method !== undefined) updateData.paymentMethod = payment_method || null;
  if (reference !== undefined) updateData.reference = reference || null;
  if (notes !== undefined) updateData.notes = notes || null;

  // Validate existing allocations are still <= new amount.
  const allocatedTotal = await getAllocatedTotal(id);
  if (round2(newAmount) < round2(allocatedTotal)) {
    res.status(400).json({ error: "New payment amount is less than existing allocations. Reduce allocations before lowering amount." });
    return;
  }

  // Determine if the fund ledger effect needs correction.
  const oldAmount = toMoney(payment.amount);
  const oldFundId = payment.fundAccountId;
  const fundChanged = oldFundId !== newFundId || Math.round(oldAmount * 100) !== Math.round(newAmount * 100);

  const [old] = await db.select().from(clientPaymentsTable).where(eq(clientPaymentsTable.id, id));

  const updated = await db.transaction(async (tx) => {
    const [result] = await tx.update(clientPaymentsTable).set(updateData).where(eq(clientPaymentsTable.id, id)).returning();

    if (fundChanged) {
      // Reverse the old ledger effect.
      await tx.insert(fundTransactionsTable).values({
        fund_account_id: oldFundId,
        transaction_type: "client_payment_reversal",
        amount: String(oldAmount),
        description: `Reversal of client payment #${id}`,
        created_by: req.user.id,
      });
      // Apply the new ledger effect.
      if (newAmount > 0) {
        await tx.insert(fundTransactionsTable).values({
          fund_account_id: newFundId,
          transaction_type: "client_payment",
          amount: String(newAmount),
          description: `Client payment #${id}`,
          created_by: req.user.id,
        });
      }
    }

    await tx.insert(auditLogsTable).values({
      userId: req.user.id,
      userEmail: req.user.email ?? null,
      action: "update",
      entityType: "client_payment",
      entityId: id,
      oldValues: old,
      newValues: result,
    });

    return result;
  });

  const allocatedNow = await getAllocatedTotal(updated.id);
  res.json({ ...updated, amount: toMoney(updated.amount), allocated: round2(allocatedNow), unallocated: round2(toMoney(updated.amount) - allocatedNow) });
});

// DELETE /payments/:id — reverse a payment
router.delete("/payments/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const [payment] = await db.select().from(clientPaymentsTable).where(eq(clientPaymentsTable.id, id));
  if (!payment) { res.status(404).json({ error: "Payment not found" }); return; }

  await db.transaction(async (tx) => {
    // Reverse the fund ledger effect.
    const amt = toMoney(payment.amount);
    await tx.insert(fundTransactionsTable).values({
      fund_account_id: payment.fundAccountId,
      transaction_type: "client_payment_reversal",
      amount: String(amt),
      description: `Reversal of deleted client payment #${id}`,
      created_by: req.user.id,
    });

    await tx.insert(auditLogsTable).values({
      userId: req.user.id,
      userEmail: req.user.email ?? null,
      action: "delete",
      entityType: "client_payment",
      entityId: id,
      oldValues: payment,
    });

    // Delete allocations (cascade via FK, but explicit for clarity).
    await tx.delete(paymentAllocationsTable).where(eq(paymentAllocationsTable.paymentId, id));
    await tx.delete(clientPaymentsTable).where(eq(clientPaymentsTable.id, id));
  });

  res.sendStatus(204);
});

// ---------------------------------------------------------------------------
// Allocations
// ---------------------------------------------------------------------------

// GET /payments/:id/allocations
router.get("/payments/:id/allocations", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [payment] = await db.select().from(clientPaymentsTable).where(eq(clientPaymentsTable.id, id));
  if (!payment) { res.status(404).json({ error: "Payment not found" }); return; }

  const allocations = await db
    .select({
      id: paymentAllocationsTable.id,
      paymentId: paymentAllocationsTable.paymentId,
      eventId: paymentAllocationsTable.eventId,
      amount: paymentAllocationsTable.amount,
      createdAt: paymentAllocationsTable.createdAt,
      eventName: eventsTable.name,
    })
    .from(paymentAllocationsTable)
    .leftJoin(eventsTable, eq(eventsTable.id, paymentAllocationsTable.eventId))
    .where(eq(paymentAllocationsTable.paymentId, id));

  const allocatedTotal = allocations.reduce((s, a) => s + toMoney(a.amount), 0);
  res.json({
    allocations: allocations.map((a) => ({ ...a, amount: toMoney(a.amount) })),
    allocated: round2(allocatedTotal),
    unallocated: round2(toMoney(payment.amount) - allocatedTotal),
  });
});

// PUT /payments/:id/allocations — replace the allocation set atomically
router.put("/payments/:id/allocations", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const [payment] = await db.select().from(clientPaymentsTable).where(eq(clientPaymentsTable.id, id));
  if (!payment) { res.status(404).json({ error: "Payment not found" }); return; }

  const payload = req.body?.allocations ?? [];

  let allocTotal = 0;
  const validated: Array<{ eventId: number; amount: number }> = [];
  const eventIds = payload.map((a: any) => parseInt(String(a?.eventId), 10)).filter((n: number) => Number.isInteger(n));
  const events = eventIds.length > 0
    ? await db.select().from(eventsTable).where(inArray(eventsTable.id, eventIds))
    : [];
  const eventMap = new Map<number, any>();
  for (const e of events) eventMap.set(e.id, e);

  // Validate all events belong to payment.client_id and amounts > 0 & total <= payment.
  for (const a of payload) {
    const eventId = parseInt(String(a?.eventId), 10);
    const amt = toMoney(a?.amount);
    const ev = eventMap.get(eventId);
    if (!ev) { res.status(400).json({ error: `Event ${eventId} was not found` }); return; }
    if (ev.clientId !== payment.clientId) { res.status(400).json({ error: `Event ${eventId} does not belong to this client` }); return; }
    if (amt <= 0) { res.status(400).json({ error: "Allocation amount must be greater than zero" }); return; }
    allocTotal += amt;
    validated.push({ eventId, amount: amt });
  }
  if (round2(allocTotal) > round2(toMoney(payment.amount))) {
    res.status(400).json({ error: "Total allocation exceeds payment amount" }); return;
  }

  // Validate each event's allocation does not exceed its remaining allocatable
  // amount. "Remaining allocatable" = total revenue already collected from the
  // existing allocations (across all payments) for the event, capped by its
  // netRevenue (legacy collected already excluded from the allocatable pool).
  const allClientPayments = await db.select().from(clientPaymentsTable).where(eq(clientPaymentsTable.clientId, payment.clientId));
  const allPaymentIds = allClientPayments.map((p) => p.id);
  const existingAllocs = allPaymentIds.length > 0
    ? await db.select().from(paymentAllocationsTable).where(inArray(paymentAllocationsTable.paymentId, allPaymentIds))
    : [];
  const allocByEvent = new Map<number, number>();
  for (const a of existingAllocs) {
    // Exclude allocations belonging to this payment (they will be replaced).
    if (a.paymentId === id) continue;
    allocByEvent.set(a.eventId, (allocByEvent.get(a.eventId) ?? 0) + toMoney(a.amount));
  }

  // Also account for legacy event-level collected amounts per event.
  const eventRevenueRows = await db
    .select({ eventId: eventRevenueTable.eventId, netRevenue: eventRevenueTable.netRevenue, totalCollected: eventRevenueTable.totalCollected })
    .from(eventRevenueTable)
    .where(inArray(eventRevenueTable.eventId, eventIds));

  for (const item of validated) {
    const rev = eventRevenueRows.find((r) => r.eventId === item.eventId);
    const netRevenue = rev ? toMoney(rev.netRevenue) : 0;
    const legacyCollected = rev ? toMoney(rev.totalCollected) : 0;
    const alreadyAllocated = allocByEvent.get(item.eventId) ?? 0;
    const allocatable = Math.max(0, netRevenue - legacyCollected - alreadyAllocated);
    if (round2(item.amount) > round2(allocatable)) {
      res.status(400).json({ error: `Allocation exceeds the event's remaining allocatable amount for event ${item.eventId}` });
      return;
    }
  }

  // All valid. Replace atomically.
  const [oldAllocRows] = await Promise.all([
    db.select().from(paymentAllocationsTable).where(eq(paymentAllocationsTable.paymentId, id)),
  ]);

  await db.transaction(async (tx) => {
    await tx.delete(paymentAllocationsTable).where(eq(paymentAllocationsTable.paymentId, id));
    for (const item of validated) {
      await tx.insert(paymentAllocationsTable).values({
        paymentId: id,
        eventId: item.eventId,
        amount: String(item.amount),
      });
    }
    await tx.insert(auditLogsTable).values({
      userId: req.user.id,
      userEmail: req.user.email ?? null,
      action: "update",
      entityType: "payment_allocation",
      entityId: id,
      oldValues: { allocations: oldAllocRows },
      newValues: { allocations: validated },
    });
  });

  const allocatedTotal = await getAllocatedTotal(id);
  res.json({
    allocations: validated,
    allocated: round2(allocatedTotal),
    unallocated: round2(toMoney(payment.amount) - allocatedTotal),
  });
});

export default router;
