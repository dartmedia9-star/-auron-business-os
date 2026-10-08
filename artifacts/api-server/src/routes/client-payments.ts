import { Router, type IRouter } from "express";
import { eq, desc, sql, and, gte, lte, ilike, inArray } from "drizzle-orm";
import {
  db,
  auditLogsTable,
  clientPaymentsTable,
  paymentAllocationsTable,
  clientsTable,
  eventsTable,
  fundAccountsTable,
  fundTransactionsTable,
} from "@workspace/db";
import { getReceivablesLedger, round2, type ClientReceivable } from "../lib/client-receivables";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Client payments
//
// A client payment is cash collection / receivable settlement, never revenue.
// It is recorded against the CLIENT; allocating it to events is optional and
// never automatic (no FIFO). Any unallocated part stays client-level.
//
// Fund ledger: every payment posts a `client_payment` (+amount) row to its
// receiving fund. An edit that changes amount or fund posts a
// `client_payment_reversal` (-old amount) on the old fund and a new
// `client_payment` on the new fund; a delete posts the reversal only. The
// payment record, allocations, ledger rows and audit log are always written in
// ONE database transaction.
// ---------------------------------------------------------------------------

function toMoney(value: unknown): number {
  const n = parseFloat(String(value));
  return Number.isFinite(n) ? n : 0;
}

function parseId(value: unknown): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function isValidDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

class PaymentError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function sendError(res: { status: (n: number) => { json: (b: unknown) => void } }, err: unknown): boolean {
  if (err instanceof PaymentError) {
    res.status(err.status).json({ error: err.message });
    return true;
  }
  return false;
}

type AllocationRow = { eventId: number; amount: number };

/**
 * Validates an optional allocation payload for a payment of `paymentAmount`
 * by `clientId`. Rules: events exist and belong to the client, no duplicate
 * events, each amount > 0, total <= payment amount, and no event receives more
 * than its remaining outstanding (legacy outstanding minus allocations from
 * OTHER payments). An empty/absent payload means client-level / unallocated.
 */
async function validateAllocations(
  clientId: number,
  paymentAmount: number,
  payload: unknown,
  paymentId: number | null,
): Promise<AllocationRow[]> {
  if (payload == null) return [];
  if (!Array.isArray(payload)) throw new PaymentError(400, "allocations must be an array");
  if (payload.length === 0) return [];

  const rows: AllocationRow[] = [];
  const seen = new Set<number>();
  for (const a of payload) {
    const eventId = parseId((a as { eventId?: unknown })?.eventId);
    if (eventId === null) throw new PaymentError(400, "Each allocation needs a valid eventId");
    const amount = round2(toMoney((a as { amount?: unknown })?.amount));
    if (amount <= 0) throw new PaymentError(400, "Allocation amount must be greater than zero");
    if (seen.has(eventId)) throw new PaymentError(400, "An event can only be allocated once per payment");
    seen.add(eventId);
    rows.push({ eventId, amount });
  }

  const total = round2(rows.reduce((s, r) => s + r.amount, 0));
  if (total > round2(paymentAmount)) throw new PaymentError(400, "Total allocation exceeds payment amount");

  const events = await db
    .select({ id: eventsTable.id, name: eventsTable.name, clientId: eventsTable.clientId })
    .from(eventsTable)
    .where(inArray(eventsTable.id, rows.map((r) => r.eventId)));
  const eventMap = new Map(events.map((e) => [e.id, e]));
  for (const r of rows) {
    const ev = eventMap.get(r.eventId);
    if (!ev) throw new PaymentError(400, `Event ${r.eventId} was not found`);
    if (ev.clientId !== clientId) throw new PaymentError(400, `Event "${ev.name}" does not belong to this client`);
  }

  // Remaining allocatable per event comes from the shared receivables ledger.
  // This payment's own current allocations are added back because they are
  // being replaced.
  const ledger = await getReceivablesLedger([clientId]);
  const ownAllocations = paymentId === null
    ? []
    : await db.select().from(paymentAllocationsTable).where(eq(paymentAllocationsTable.paymentId, paymentId));
  const ownByEvent = new Map(ownAllocations.map((a) => [a.eventId, toMoney(a.amount)]));
  for (const r of rows) {
    const remaining = round2((ledger.events.get(r.eventId)?.outstanding ?? 0) + (ownByEvent.get(r.eventId) ?? 0));
    if (r.amount > remaining) {
      const ev = eventMap.get(r.eventId)!;
      throw new PaymentError(400, `Allocation to "${ev.name}" exceeds its outstanding amount (₹${remaining.toLocaleString("en-IN")}). Leave the excess client-level instead.`);
    }
  }

  return rows;
}

function receivableFields(r: ClientReceivable | undefined, clientId: number) {
  return {
    clientId,
    totalBilled: r?.totalBilled ?? 0,
    legacyCollected: r?.legacyCollected ?? 0,
    totalReceived: r?.totalReceived ?? 0,
    newReceived: r?.newReceived ?? 0,
    outstanding: r?.outstanding ?? 0,
    credit: r?.credit ?? 0,
    unallocated: r?.unallocated ?? 0,
  };
}

async function loadAllocationsWithNames(paymentIds: number[]) {
  if (paymentIds.length === 0) return [];
  return db
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
    .where(inArray(paymentAllocationsTable.paymentId, paymentIds));
}

async function serializePayment(paymentId: number) {
  const [payment] = await db.select().from(clientPaymentsTable).where(eq(clientPaymentsTable.id, paymentId));
  if (!payment) return null;
  const [client] = await db.select({ name: clientsTable.name }).from(clientsTable).where(eq(clientsTable.id, payment.clientId));
  const [fund] = await db.select({ name: fundAccountsTable.name }).from(fundAccountsTable).where(eq(fundAccountsTable.id, payment.fundAccountId));
  const allocations = (await loadAllocationsWithNames([paymentId])).map((a) => ({ ...a, amount: toMoney(a.amount) }));
  const allocated = round2(allocations.reduce((s, a) => s + a.amount, 0));
  const amount = toMoney(payment.amount);
  return {
    ...payment,
    amount,
    clientName: client?.name ?? "Unknown",
    fundAccountName: fund?.name ?? "Unknown",
    allocations,
    allocated,
    unallocated: round2(amount - allocated),
  };
}

// ---------------------------------------------------------------------------
// Client receivable summary
// ---------------------------------------------------------------------------

// GET /clients/:id/receivables
router.get("/clients/:id/receivables", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (id === null) { res.status(400).json({ error: "Invalid client id" }); return; }
  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, id));
  if (!client) { res.status(404).json({ error: "Client not found" }); return; }

  const ledger = await getReceivablesLedger([id]);
  const events = await db
    .select({ id: eventsTable.id, name: eventsTable.name, eventDate: eventsTable.eventDate })
    .from(eventsTable)
    .where(eq(eventsTable.clientId, id))
    .orderBy(eventsTable.eventDate);

  const eventRows = events.map((ev) => {
    const e = ledger.events.get(ev.id);
    return {
      eventId: ev.id,
      eventName: ev.name,
      eventDate: ev.eventDate,
      revenue: e?.revenue ?? 0,
      legacyCollected: e?.legacyCollected ?? 0,
      allocated: e?.allocated ?? 0,
      outstanding: e?.outstanding ?? 0,
    };
  });

  res.json({ client: { id: client.id, name: client.name }, ...receivableFields(ledger.clients.get(id), id), events: eventRows });
});

// GET /finance/client-receivables — all clients' receivable summaries
router.get("/finance/client-receivables", async (req, res): Promise<void> => {
  const { search, page = "1", limit = "50" } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(500, Math.max(1, parseInt(limit, 10) || 50));
  const offset = (pageNum - 1) * limitNum;

  const where = search
    ? sql`(${ilike(clientsTable.name, `%${search}%`)} OR ${ilike(clientsTable.company, `%${search}%`)})`
    : undefined;

  const [clients, totalResult] = await Promise.all([
    db.select().from(clientsTable).where(where).orderBy(desc(clientsTable.createdAt)).limit(limitNum).offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(clientsTable).where(where),
  ]);

  const ledger = await getReceivablesLedger(clients.map((c) => c.id));
  const data = clients.map((c) => ({ ...c, ...receivableFields(ledger.clients.get(c.id), c.id) }));

  res.json({ data, total: totalResult[0]?.count ?? 0, page: pageNum, limit: limitNum });
});

// ---------------------------------------------------------------------------
// Client payments
// ---------------------------------------------------------------------------

// GET /clients/:id/payments — list payments for a client (newest first)
router.get("/clients/:id/payments", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (id === null) { res.status(400).json({ error: "Invalid client id" }); return; }
  const { page = "1", limit = "50", fromDate, toDate, fundAccountId } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(500, Math.max(1, parseInt(limit, 10) || 50));
  const offset = (pageNum - 1) * limitNum;

  const conditions = [eq(clientPaymentsTable.clientId, id)];
  if (fromDate && isValidDate(fromDate)) conditions.push(gte(clientPaymentsTable.paymentDate, fromDate));
  if (toDate && isValidDate(toDate)) conditions.push(lte(clientPaymentsTable.paymentDate, toDate));
  const fundFilter = parseId(fundAccountId);
  if (fundFilter !== null) conditions.push(eq(clientPaymentsTable.fundAccountId, fundFilter));
  const where = and(...conditions);

  const [payments, totalResult, fundAccounts] = await Promise.all([
    db.select().from(clientPaymentsTable).where(where)
      .orderBy(desc(clientPaymentsTable.paymentDate), desc(clientPaymentsTable.id))
      .limit(limitNum).offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(clientPaymentsTable).where(where),
    db.select({ id: fundAccountsTable.id, name: fundAccountsTable.name }).from(fundAccountsTable),
  ]);
  const accountMap = new Map(fundAccounts.map((a) => [a.id, a.name]));

  const allocRows = await loadAllocationsWithNames(payments.map((p) => p.id));
  const allocByPayment = new Map<number, typeof allocRows>();
  for (const a of allocRows) {
    const list = allocByPayment.get(a.paymentId) ?? [];
    list.push(a);
    allocByPayment.set(a.paymentId, list);
  }

  const data = payments.map((p) => {
    const allocations = (allocByPayment.get(p.id) ?? []).map((a) => ({ ...a, amount: toMoney(a.amount) }));
    const allocated = round2(allocations.reduce((s, a) => s + a.amount, 0));
    const amount = toMoney(p.amount);
    return {
      ...p,
      amount,
      allocations,
      allocated,
      unallocated: round2(amount - allocated),
      fundAccountName: accountMap.get(p.fundAccountId) ?? "Unknown",
    };
  });

  res.json({ data, total: totalResult[0]?.count ?? 0, page: pageNum, limit: limitNum });
});

// POST /clients/:id/payments — record a new payment (client-level, or
// optionally allocated to one or more of the client's events)
router.post("/clients/:id/payments", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const clientId = parseId(req.params.id);
    if (clientId === null) throw new PaymentError(400, "Invalid client id");

    const { amount, payment_date, fund_account_id, payment_method, reference, notes, allocations } = req.body ?? {};

    const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, clientId));
    if (!client) throw new PaymentError(400, "Client not found");

    const amountNum = round2(toMoney(amount));
    if (amountNum <= 0) throw new PaymentError(400, "amount must be greater than zero");
    if (!isValidDate(payment_date)) throw new PaymentError(400, "payment_date must be a valid date (YYYY-MM-DD)");

    const fundId = parseId(fund_account_id);
    const [fundAccount] = fundId === null
      ? []
      : await db.select().from(fundAccountsTable).where(eq(fundAccountsTable.id, fundId));
    if (!fundAccount) throw new PaymentError(400, "Select a valid receiving fund account");

    const allocationRows = await validateAllocations(clientId, amountNum, allocations, null);

    const createdId = await db.transaction(async (tx) => {
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

      // Cash collection: the receiving fund's balance increases.
      await tx.insert(fundTransactionsTable).values({
        fund_account_id: fundAccount.id,
        transaction_type: "client_payment",
        amount: String(amountNum),
        description: `Client payment #${payment.id} from ${client.name}`,
        created_by: req.user.id,
      });

      for (const a of allocationRows) {
        await tx.insert(paymentAllocationsTable).values({ paymentId: payment.id, eventId: a.eventId, amount: String(a.amount) });
      }

      await tx.insert(auditLogsTable).values({
        userId: req.user.id,
        userEmail: req.user.email ?? null,
        action: "create",
        entityType: "client_payment",
        entityId: payment.id,
        newValues: { ...payment, amount: amountNum, allocations: allocationRows },
      });

      return payment.id;
    });

    res.status(201).json(await serializePayment(createdId));
  } catch (err) {
    if (sendError(res, err)) return;
    throw err;
  }
});

// GET /payments/:id — single payment with allocations
router.get("/payments/:id", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (id === null) { res.status(400).json({ error: "Invalid payment id" }); return; }
  const payment = await serializePayment(id);
  if (!payment) { res.status(404).json({ error: "Payment not found" }); return; }
  res.json(payment);
});

// PATCH /payments/:id — update payment fields and, when `allocations` is
// present, replace its allocation set (an empty array makes it client-level).
// Everything, including the fund ledger correction, commits atomically.
router.patch("/payments/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const id = parseId(req.params.id);
    if (id === null) throw new PaymentError(400, "Invalid payment id");

    const { amount, payment_date, fund_account_id, payment_method, reference, notes, allocations } = req.body ?? {};

    const [payment] = await db.select().from(clientPaymentsTable).where(eq(clientPaymentsTable.id, id));
    if (!payment) throw new PaymentError(404, "Payment not found");

    const updateData: Record<string, unknown> = { updatedBy: req.user.id };
    let newAmount = toMoney(payment.amount);
    let newFundId = payment.fundAccountId;

    if (amount !== undefined) {
      const amt = round2(toMoney(amount));
      if (amt <= 0) throw new PaymentError(400, "amount must be greater than zero");
      newAmount = amt;
      updateData.amount = String(amt);
    }
    if (payment_date !== undefined) {
      if (!isValidDate(payment_date)) throw new PaymentError(400, "payment_date must be a valid date (YYYY-MM-DD)");
      updateData.paymentDate = payment_date;
    }
    if (fund_account_id !== undefined) {
      const fid = parseId(fund_account_id);
      const [acc] = fid === null ? [] : await db.select().from(fundAccountsTable).where(eq(fundAccountsTable.id, fid));
      if (!acc) throw new PaymentError(400, "Select a valid receiving fund account");
      newFundId = acc.id;
      updateData.fundAccountId = acc.id;
    }
    if (payment_method !== undefined) updateData.paymentMethod = payment_method || null;
    if (reference !== undefined) updateData.reference = reference || null;
    if (notes !== undefined) updateData.notes = notes || null;

    const replaceAllocations = allocations !== undefined;
    const newAllocations = replaceAllocations
      ? await validateAllocations(payment.clientId, newAmount, allocations, id)
      : null;

    const oldAllocations = await db.select().from(paymentAllocationsTable).where(eq(paymentAllocationsTable.paymentId, id));
    if (!replaceAllocations) {
      const allocatedTotal = round2(oldAllocations.reduce((s, a) => s + toMoney(a.amount), 0));
      if (round2(newAmount) < allocatedTotal) {
        throw new PaymentError(400, "New payment amount is less than its event allocations. Reduce the allocations first.");
      }
    }

    const oldAmount = toMoney(payment.amount);
    const oldFundId = payment.fundAccountId;
    const fundChanged = oldFundId !== newFundId || Math.round(oldAmount * 100) !== Math.round(newAmount * 100);

    await db.transaction(async (tx) => {
      const [result] = await tx.update(clientPaymentsTable).set(updateData).where(eq(clientPaymentsTable.id, id)).returning();

      if (fundChanged) {
        // Reverse the old ledger effect, then apply the new one.
        await tx.insert(fundTransactionsTable).values({
          fund_account_id: oldFundId,
          transaction_type: "client_payment_reversal",
          amount: String(oldAmount),
          description: `Reversal of client payment #${id} (edited)`,
          created_by: req.user.id,
        });
        await tx.insert(fundTransactionsTable).values({
          fund_account_id: newFundId,
          transaction_type: "client_payment",
          amount: String(newAmount),
          description: `Client payment #${id} (edited)`,
          created_by: req.user.id,
        });
      }

      if (newAllocations) {
        await tx.delete(paymentAllocationsTable).where(eq(paymentAllocationsTable.paymentId, id));
        for (const a of newAllocations) {
          await tx.insert(paymentAllocationsTable).values({ paymentId: id, eventId: a.eventId, amount: String(a.amount) });
        }
      }

      await tx.insert(auditLogsTable).values({
        userId: req.user.id,
        userEmail: req.user.email ?? null,
        action: "update",
        entityType: "client_payment",
        entityId: id,
        oldValues: { ...payment, allocations: oldAllocations.map((a) => ({ eventId: a.eventId, amount: toMoney(a.amount) })) },
        newValues: { ...result, allocations: newAllocations ?? oldAllocations.map((a) => ({ eventId: a.eventId, amount: toMoney(a.amount) })) },
      });
    });

    res.json(await serializePayment(id));
  } catch (err) {
    if (sendError(res, err)) return;
    throw err;
  }
});

// DELETE /payments/:id — reverse a payment: posts a reversal to the receiving
// fund, records the audit entry, and removes the payment and its allocations.
router.delete("/payments/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseId(req.params.id);
  if (id === null) { res.status(400).json({ error: "Invalid payment id" }); return; }

  const deleted = await db.transaction(async (tx) => {
    const [payment] = await tx.select().from(clientPaymentsTable).where(eq(clientPaymentsTable.id, id));
    if (!payment) return false;
    const allocations = await tx.select().from(paymentAllocationsTable).where(eq(paymentAllocationsTable.paymentId, id));

    await tx.insert(fundTransactionsTable).values({
      fund_account_id: payment.fundAccountId,
      transaction_type: "client_payment_reversal",
      amount: String(toMoney(payment.amount)),
      description: `Reversal of deleted client payment #${id}`,
      created_by: req.user.id,
    });

    await tx.insert(auditLogsTable).values({
      userId: req.user.id,
      userEmail: req.user.email ?? null,
      action: "delete",
      entityType: "client_payment",
      entityId: id,
      oldValues: { ...payment, allocations: allocations.map((a) => ({ eventId: a.eventId, amount: toMoney(a.amount) })) },
    });

    await tx.delete(paymentAllocationsTable).where(eq(paymentAllocationsTable.paymentId, id));
    await tx.delete(clientPaymentsTable).where(eq(clientPaymentsTable.id, id));
    return true;
  });

  if (!deleted) { res.status(404).json({ error: "Payment not found" }); return; }
  res.sendStatus(204);
});

// ---------------------------------------------------------------------------
// Allocations
// ---------------------------------------------------------------------------

// GET /payments/:id/allocations
router.get("/payments/:id/allocations", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (id === null) { res.status(400).json({ error: "Invalid payment id" }); return; }
  const payment = await serializePayment(id);
  if (!payment) { res.status(404).json({ error: "Payment not found" }); return; }
  res.json({ allocations: payment.allocations, allocated: payment.allocated, unallocated: payment.unallocated });
});

// PUT /payments/:id/allocations — replace the allocation set atomically (an
// empty array makes the whole payment client-level / unallocated)
router.put("/payments/:id/allocations", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const id = parseId(req.params.id);
    if (id === null) throw new PaymentError(400, "Invalid payment id");
    const [payment] = await db.select().from(clientPaymentsTable).where(eq(clientPaymentsTable.id, id));
    if (!payment) throw new PaymentError(404, "Payment not found");

    const validated = await validateAllocations(payment.clientId, toMoney(payment.amount), req.body?.allocations ?? [], id);
    const oldAllocRows = await db.select().from(paymentAllocationsTable).where(eq(paymentAllocationsTable.paymentId, id));

    await db.transaction(async (tx) => {
      await tx.delete(paymentAllocationsTable).where(eq(paymentAllocationsTable.paymentId, id));
      for (const item of validated) {
        await tx.insert(paymentAllocationsTable).values({ paymentId: id, eventId: item.eventId, amount: String(item.amount) });
      }
      await tx.insert(auditLogsTable).values({
        userId: req.user.id,
        userEmail: req.user.email ?? null,
        action: "update",
        entityType: "payment_allocation",
        entityId: id,
        oldValues: { allocations: oldAllocRows.map((a) => ({ eventId: a.eventId, amount: toMoney(a.amount) })) },
        newValues: { allocations: validated },
      });
    });

    const updated = await serializePayment(id);
    res.json({ allocations: updated?.allocations ?? [], allocated: updated?.allocated ?? 0, unallocated: updated?.unallocated ?? 0 });
  } catch (err) {
    if (sendError(res, err)) return;
    throw err;
  }
});

export default router;
