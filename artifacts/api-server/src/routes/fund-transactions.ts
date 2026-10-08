import { Router, type IRouter } from "express";
import { and, desc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from "drizzle-orm";
import {
  db,
  auditLogsTable,
  clientPaymentsTable,
  clientsTable,
  eventsTable,
  fundAccountsTable,
  fundTransactionsTable,
  fundTransfersTable,
  operatingExpensesTable,
  paymentAllocationsTable,
} from "@workspace/db";
import { isValidDate } from "../lib/business-date";
import { isInternalTransfer, LEDGER_TYPES, REVERSAL_TYPES, round2, signedEffect, toMoney } from "../lib/fund-ledger";
import { loadUserNames } from "../lib/user-names";
import { serializePayment } from "./client-payments";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Unified fund transaction history
//
// A read-only view over the existing fund_transactions ledger (the one place
// every cash movement is recorded): client payments, expenses, transfers,
// reversals and adjustments across all funds. Nothing here writes, and no
// second history is kept; rows are only enriched with the records they link
// to (client payment, expense, transfer) for display.
//
// Status per row:
//   reversal  the row is itself a client_payment_reversal / expense_reversal
//   reversed  a later reversal exists for the same payment / expense, so this
//             row's effect has been undone (edit or delete)
//   posted    the row's effect currently stands
// ---------------------------------------------------------------------------

type LedgerRow = typeof fundTransactionsTable.$inferSelect;

const CATEGORY_TYPES: Record<string, string[]> = {
  client_payment: ["client_payment", "client_payment_reversal"],
  expense: ["expense", "expense_reversal"],
  transfer: ["transfer_in", "transfer_out"],
  adjustment: ["adjustment"],
};

function categoryOf(type: string): string {
  for (const [category, types] of Object.entries(CATEGORY_TYPES)) {
    if (types.includes(type)) return category;
  }
  return "other";
}

function parseId(value: unknown): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// SQL conditions matching rows whose cash effect is in / out. Adjustments are
// signed by their stored amount; every other type by its ledger rule.
const MONEY_IN_SQL = sql`(${fundTransactionsTable.transaction_type} in ('client_payment', 'expense_reversal', 'transfer_in') or (${fundTransactionsTable.transaction_type} = 'adjustment' and ${fundTransactionsTable.amount} >= 0))`;
const MONEY_OUT_SQL = sql`(${fundTransactionsTable.transaction_type} in ('client_payment_reversal', 'expense', 'transfer_out') or (${fundTransactionsTable.transaction_type} = 'adjustment' and ${fundTransactionsTable.amount} < 0))`;

type DeletedPaymentSnapshot = {
  clientId: number | null;
  paymentMethod: string | null;
  reference: string | null;
  notes: string | null;
  allocations: Array<{ eventId: number; amount: number }>;
  deletedAt: Date;
};

/** Last-known values of deleted client payments, from their delete audit entry. */
async function loadDeletedPayments(paymentIds: number[]): Promise<Map<number, DeletedPaymentSnapshot>> {
  if (paymentIds.length === 0) return new Map();
  const logs = await db
    .select({ entityId: auditLogsTable.entityId, oldValues: auditLogsTable.oldValues, createdAt: auditLogsTable.createdAt })
    .from(auditLogsTable)
    .where(and(
      eq(auditLogsTable.entityType, "client_payment"),
      eq(auditLogsTable.action, "delete"),
      inArray(auditLogsTable.entityId, paymentIds),
    ));
  const result = new Map<number, DeletedPaymentSnapshot>();
  for (const log of logs) {
    const v = (log.oldValues ?? {}) as Record<string, unknown>;
    const allocations = Array.isArray(v.allocations)
      ? (v.allocations as Array<Record<string, unknown>>)
          .map((a) => ({ eventId: Number(a.eventId), amount: toMoney(a.amount) }))
          .filter((a) => Number.isInteger(a.eventId))
      : [];
    result.set(log.entityId, {
      clientId: Number.isInteger(Number(v.clientId)) ? Number(v.clientId) : null,
      paymentMethod: typeof v.paymentMethod === "string" ? v.paymentMethod : null,
      reference: typeof v.reference === "string" ? v.reference : null,
      notes: typeof v.notes === "string" ? v.notes : null,
      allocations,
      deletedAt: log.createdAt,
    });
  }
  return result;
}

/** Enriches ledger rows with fund, client, event, transfer and expense details. */
async function enrichRows(rows: LedgerRow[]) {
  const paymentIds = [...new Set(rows.map((r) => r.related_client_payment_id).filter((id): id is number => id !== null))];
  const expenseIds = [...new Set(rows.map((r) => r.related_expense_id).filter((id): id is number => id !== null))];
  const transferIds = [...new Set(rows.map((r) => r.related_transfer_id).filter((id): id is number => id !== null))];

  const [accounts, payments, allocations, expenses, transfers, reversalMaxima, userNames] = await Promise.all([
    db.select({ id: fundAccountsTable.id, name: fundAccountsTable.name }).from(fundAccountsTable),
    paymentIds.length > 0 ? db.select().from(clientPaymentsTable).where(inArray(clientPaymentsTable.id, paymentIds)) : Promise.resolve([] as (typeof clientPaymentsTable.$inferSelect)[]),
    paymentIds.length > 0
      ? db.select({ paymentId: paymentAllocationsTable.paymentId, eventId: paymentAllocationsTable.eventId, amount: paymentAllocationsTable.amount })
          .from(paymentAllocationsTable)
          .where(inArray(paymentAllocationsTable.paymentId, paymentIds))
      : Promise.resolve([]),
    expenseIds.length > 0 ? db.select().from(operatingExpensesTable).where(inArray(operatingExpensesTable.id, expenseIds)) : Promise.resolve([] as (typeof operatingExpensesTable.$inferSelect)[]),
    transferIds.length > 0 ? db.select().from(fundTransfersTable).where(inArray(fundTransfersTable.id, transferIds)) : Promise.resolve([] as (typeof fundTransfersTable.$inferSelect)[]),
    // Latest reversal per payment / expense, to tell posted rows from reversed ones.
    paymentIds.length > 0 || expenseIds.length > 0
      ? db.select({
          paymentId: fundTransactionsTable.related_client_payment_id,
          expenseId: fundTransactionsTable.related_expense_id,
          type: fundTransactionsTable.transaction_type,
          maxId: sql<number>`max(${fundTransactionsTable.id})::int`,
        })
          .from(fundTransactionsTable)
          .where(or(
            paymentIds.length > 0
              ? and(eq(fundTransactionsTable.transaction_type, "client_payment_reversal"), inArray(fundTransactionsTable.related_client_payment_id, paymentIds))
              : sql`false`,
            expenseIds.length > 0
              ? and(eq(fundTransactionsTable.transaction_type, "expense_reversal"), inArray(fundTransactionsTable.related_expense_id, expenseIds))
              : sql`false`,
          ))
          .groupBy(fundTransactionsTable.related_client_payment_id, fundTransactionsTable.related_expense_id, fundTransactionsTable.transaction_type)
      : Promise.resolve([]),
    loadUserNames(rows.map((r) => r.created_by)),
  ]);

  const deletedPayments = await loadDeletedPayments(paymentIds.filter((id) => !payments.some((p) => p.id === id)));

  const clientIds = [...new Set([
    ...payments.map((p) => p.clientId),
    ...[...deletedPayments.values()].map((d) => d.clientId).filter((id): id is number => id !== null),
  ])];
  const eventIds = [...new Set([
    ...allocations.map((a) => a.eventId),
    ...[...deletedPayments.values()].flatMap((d) => d.allocations.map((a) => a.eventId)),
    ...expenses.map((e) => e.eventId).filter((id): id is number => id !== null),
  ])];
  const [clients, events] = await Promise.all([
    clientIds.length > 0 ? db.select({ id: clientsTable.id, name: clientsTable.name }).from(clientsTable).where(inArray(clientsTable.id, clientIds)) : Promise.resolve([]),
    eventIds.length > 0 ? db.select({ id: eventsTable.id, name: eventsTable.name }).from(eventsTable).where(inArray(eventsTable.id, eventIds)) : Promise.resolve([]),
  ]);

  const accountNames = new Map(accounts.map((a) => [a.id, a.name]));
  const clientNames = new Map(clients.map((c) => [c.id, c.name]));
  const eventNames = new Map(events.map((e) => [e.id, e.name]));
  const paymentMap = new Map(payments.map((p) => [p.id, p]));
  const expenseMap = new Map(expenses.map((e) => [e.id, e]));
  const transferMap = new Map(transfers.map((t) => [t.id, t]));
  const allocationsByPayment = new Map<number, Array<{ eventId: number; amount: number }>>();
  for (const a of allocations) {
    const list = allocationsByPayment.get(a.paymentId) ?? [];
    list.push({ eventId: a.eventId, amount: toMoney(a.amount) });
    allocationsByPayment.set(a.paymentId, list);
  }
  const lastPaymentReversal = new Map<number, number>();
  const lastExpenseReversal = new Map<number, number>();
  for (const r of reversalMaxima) {
    if (r.type === "client_payment_reversal" && r.paymentId !== null) lastPaymentReversal.set(r.paymentId, r.maxId);
    if (r.type === "expense_reversal" && r.expenseId !== null) lastExpenseReversal.set(r.expenseId, r.maxId);
  }

  return rows.map((r) => {
    const amount = toMoney(r.amount);
    const effect = signedEffect(r.transaction_type, amount);

    let status: "posted" | "reversed" | "reversal" = "posted";
    if (REVERSAL_TYPES.has(r.transaction_type)) status = "reversal";
    else if (r.transaction_type === "client_payment" && r.related_client_payment_id !== null && (lastPaymentReversal.get(r.related_client_payment_id) ?? 0) > r.id) status = "reversed";
    else if (r.transaction_type === "expense" && r.related_expense_id !== null && (lastExpenseReversal.get(r.related_expense_id) ?? 0) > r.id) status = "reversed";

    let clientId: number | null = null;
    let paymentMethod: string | null = null;
    let reference: string | null = null;
    let notes: string | null = null;
    let paymentDeleted = false;
    let eventLinks: Array<{ eventId: number; eventName: string | null; amount: number | null }> = [];
    let expenseCategory: string | null = null;
    let counterpartyFundId: number | null = null;

    if (r.related_client_payment_id !== null) {
      const p = paymentMap.get(r.related_client_payment_id);
      const deleted = deletedPayments.get(r.related_client_payment_id);
      if (p) {
        clientId = p.clientId;
        paymentMethod = p.paymentMethod;
        reference = p.reference;
        notes = p.notes;
        eventLinks = (allocationsByPayment.get(p.id) ?? []).map((a) => ({ eventId: a.eventId, eventName: eventNames.get(a.eventId) ?? null, amount: a.amount }));
      } else if (deleted) {
        paymentDeleted = true;
        clientId = deleted.clientId;
        paymentMethod = deleted.paymentMethod;
        reference = deleted.reference;
        notes = deleted.notes;
        eventLinks = deleted.allocations.map((a) => ({ eventId: a.eventId, eventName: eventNames.get(a.eventId) ?? null, amount: a.amount }));
      }
    } else if (r.related_expense_id !== null) {
      const e = expenseMap.get(r.related_expense_id);
      if (e) {
        paymentMethod = e.paymentMethod;
        reference = e.referenceNumber;
        expenseCategory = e.category;
        if (e.eventId !== null) eventLinks = [{ eventId: e.eventId, eventName: eventNames.get(e.eventId) ?? null, amount: null }];
      }
    } else if (r.related_transfer_id !== null) {
      const t = transferMap.get(r.related_transfer_id);
      if (t) counterpartyFundId = r.transaction_type === "transfer_out" ? t.to_account_id : t.from_account_id;
    }

    return {
      id: r.id,
      fundAccountId: r.fund_account_id,
      fundAccountName: accountNames.get(r.fund_account_id) ?? null,
      transactionType: r.transaction_type,
      category: categoryOf(r.transaction_type),
      amount,
      signedAmount: round2(effect),
      direction: effect >= 0 ? ("in" as const) : ("out" as const),
      isInternalTransfer: isInternalTransfer(r.transaction_type),
      transactionDate: r.transaction_date,
      description: r.description,
      status,
      clientId,
      clientName: clientId !== null ? clientNames.get(clientId) ?? null : null,
      events: eventLinks,
      paymentMethod,
      reference,
      notes,
      expenseCategory,
      counterpartyFundId,
      counterpartyFundName: counterpartyFundId !== null ? accountNames.get(counterpartyFundId) ?? null : null,
      relatedClientPaymentId: r.related_client_payment_id,
      relatedExpenseId: r.related_expense_id,
      relatedTransferId: r.related_transfer_id,
      paymentDeleted,
      createdBy: r.created_by,
      createdByName: r.created_by ? userNames.get(r.created_by) ?? null : null,
      createdAt: r.created_at,
    };
  });
}

// GET /fund-transactions — every fund's ledger rows, newest first (by
// effective date), with filters and totals for the whole filtered set.
router.get("/fund-transactions", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { fundAccountId, category, type, direction, clientId, fromDate, toDate, search, page = "1", limit = "50" } = req.query as Record<string, string | undefined>;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));

  const conditions: SQL[] = [];
  const fundId = parseId(fundAccountId);
  if (fundId !== null) conditions.push(eq(fundTransactionsTable.fund_account_id, fundId));
  if (category && CATEGORY_TYPES[category]) conditions.push(inArray(fundTransactionsTable.transaction_type, CATEGORY_TYPES[category]));
  if (type && (LEDGER_TYPES as readonly string[]).includes(type)) conditions.push(eq(fundTransactionsTable.transaction_type, type));
  if (direction === "in") conditions.push(MONEY_IN_SQL);
  if (direction === "out") conditions.push(MONEY_OUT_SQL);
  if (fromDate && isValidDate(fromDate)) conditions.push(gte(fundTransactionsTable.transaction_date, fromDate));
  if (toDate && isValidDate(toDate)) conditions.push(lte(fundTransactionsTable.transaction_date, toDate));
  if (search && search.trim()) conditions.push(ilike(fundTransactionsTable.description, `%${search.trim()}%`));
  const clientFilter = parseId(clientId);
  if (clientFilter !== null) {
    // The client's current payments, plus deleted ones known from the audit log.
    conditions.push(sql`(${fundTransactionsTable.related_client_payment_id} in (select id from client_payments where client_id = ${clientFilter})
      or ${fundTransactionsTable.related_client_payment_id} in (select entity_id from audit_logs where entity_type = 'client_payment' and action = 'delete' and old_values->>'clientId' = ${String(clientFilter)}))`);
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, allMatching] = await Promise.all([
    db.select().from(fundTransactionsTable).where(where)
      .orderBy(desc(fundTransactionsTable.transaction_date), desc(fundTransactionsTable.created_at), desc(fundTransactionsTable.id))
      .limit(limitNum).offset((pageNum - 1) * limitNum),
    db.select({ transaction_type: fundTransactionsTable.transaction_type, amount: fundTransactionsTable.amount }).from(fundTransactionsTable).where(where),
  ]);

  // Totals use the same ledger rules as balances. Transfers are reported
  // separately: they are internal, not business cash in/out.
  let cashIn = 0, cashOut = 0, internalIn = 0, internalOut = 0;
  for (const t of allMatching) {
    const effect = signedEffect(t.transaction_type, toMoney(t.amount));
    if (isInternalTransfer(t.transaction_type)) {
      if (effect > 0) internalIn += effect; else internalOut -= effect;
    } else if (effect > 0) cashIn += effect;
    else cashOut -= effect;
  }

  res.json({
    data: await enrichRows(rows),
    total: allMatching.length,
    page: pageNum,
    limit: limitNum,
    totals: {
      cashIn: round2(cashIn),
      cashOut: round2(cashOut),
      netCash: round2(cashIn - cashOut),
      internalTransfersIn: round2(internalIn),
      internalTransfersOut: round2(internalOut),
    },
  });
});

// GET /fund-transactions/:id — one ledger row with its related records,
// allocation status and audit trail.
router.get("/fund-transactions/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseId(req.params.id);
  if (id === null) { res.status(400).json({ error: "Invalid transaction id" }); return; }
  const [row] = await db.select().from(fundTransactionsTable).where(eq(fundTransactionsTable.id, id));
  if (!row) { res.status(404).json({ error: "Transaction not found" }); return; }

  const [entry] = await enrichRows([row]);

  // Every ledger row for the same source record (payment / expense / transfer).
  const siblingWhere = row.related_client_payment_id !== null
    ? eq(fundTransactionsTable.related_client_payment_id, row.related_client_payment_id)
    : row.related_expense_id !== null
      ? eq(fundTransactionsTable.related_expense_id, row.related_expense_id)
      : row.related_transfer_id !== null
        ? eq(fundTransactionsTable.related_transfer_id, row.related_transfer_id)
        : eq(fundTransactionsTable.id, row.id);
  const siblings = await db.select().from(fundTransactionsTable).where(siblingWhere).orderBy(fundTransactionsTable.id);
  const ledgerEntries = (await enrichRows(siblings)).map((s) => ({
    id: s.id,
    transactionType: s.transactionType,
    fundAccountName: s.fundAccountName,
    amount: s.amount,
    signedAmount: s.signedAmount,
    transactionDate: s.transactionDate,
    status: s.status,
    createdAt: s.createdAt,
  }));

  let payment: Record<string, unknown> | null = null;
  let allocationStatus: "fully_allocated" | "partially_allocated" | "client_level" | null = null;
  let auditEntity: { types: string[]; id: number } | null = null;

  if (row.related_client_payment_id !== null) {
    auditEntity = { types: ["client_payment", "payment_allocation"], id: row.related_client_payment_id };
    const current = await serializePayment(row.related_client_payment_id);
    if (current) {
      payment = { ...current, deleted: false };
      allocationStatus = current.allocated <= 0 ? "client_level" : current.unallocated > 0 ? "partially_allocated" : "fully_allocated";
    } else {
      payment = { id: row.related_client_payment_id, deleted: true };
    }
  }

  let transfer: Record<string, unknown> | null = null;
  if (row.related_transfer_id !== null) {
    auditEntity = { types: ["fund_transfer"], id: row.related_transfer_id };
    const [t] = await db.select().from(fundTransfersTable).where(eq(fundTransfersTable.id, row.related_transfer_id));
    if (t) {
      const names = new Map((await db.select({ id: fundAccountsTable.id, name: fundAccountsTable.name }).from(fundAccountsTable)).map((a) => [a.id, a.name]));
      transfer = { ...t, amount: toMoney(t.amount), fromAccountName: names.get(t.from_account_id) ?? null, toAccountName: names.get(t.to_account_id) ?? null };
    }
  }

  let expense: Record<string, unknown> | null = null;
  if (row.related_expense_id !== null) {
    auditEntity = { types: ["operating_expense"], id: row.related_expense_id };
    const [e] = await db.select().from(operatingExpensesTable).where(eq(operatingExpensesTable.id, row.related_expense_id));
    if (e) expense = { ...e, amount: toMoney(e.amount), gst: toMoney(e.gst) };
  }

  const auditRows = auditEntity
    ? await db.select().from(auditLogsTable)
        .where(and(inArray(auditLogsTable.entityType, auditEntity.types), eq(auditLogsTable.entityId, auditEntity.id)))
        .orderBy(desc(auditLogsTable.createdAt), desc(auditLogsTable.id))
    : [];
  const auditNames = await loadUserNames(auditRows.map((a) => a.userId));

  res.json({
    ...entry,
    related: { payment, transfer, expense, ledgerEntries },
    allocationStatus,
    audit: auditRows.map((a) => ({
      id: a.id,
      action: a.action,
      entityType: a.entityType,
      entityId: a.entityId,
      userId: a.userId,
      userName: auditNames.get(a.userId) ?? null,
      userEmail: a.userEmail,
      oldValues: a.oldValues,
      newValues: a.newValues,
      createdAt: a.createdAt,
    })),
  });
});

export default router;
