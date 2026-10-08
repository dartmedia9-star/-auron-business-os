import { inArray } from "drizzle-orm";
import {
  db,
  eventsTable,
  eventRevenueTable,
  clientPaymentsTable,
  paymentAllocationsTable,
} from "@workspace/db";

// ---------------------------------------------------------------------------
// Receivables: single source of truth
//
// Two payment sources exist and are kept additive, never merged:
//  - Legacy event-level collections: event_revenue.totalCollected (and its
//    derived outstandingAmount). These predate client_payments and are never
//    rewritten.
//  - Client payments: client_payments.amount. A payment is either fully or
//    partly allocated to events (payment_allocations) or left client-level /
//    unallocated. Recording one never touches event_revenue, so the two sources
//    cannot double count the same money.
//
// Client level (authoritative):
//   billed      = sum of event_revenue.netRevenue for the client's events
//   received    = legacy collected + all client payments (allocated or not)
//   outstanding = max(0, billed - received); any excess is client credit.
//
// Event level (for aging and per-event views):
//   outstanding = max(0, legacy outstandingAmount - allocations to the event)
//   Unallocated payments reduce the client total but are never assigned to an
//   event, so sum(event outstanding) >= client outstanding. The difference is
//   reported as unallocated payments applied.
//
// Client payments are cash collection / receivable settlement only. Nothing
// here affects revenue or profit.
// ---------------------------------------------------------------------------

export type EventReceivable = {
  eventId: number;
  clientId: number;
  revenue: number;
  legacyCollected: number;
  allocated: number;
  outstanding: number;
  dueDate: string | null;
  paymentStatus: string | null;
};

export type ClientReceivable = {
  clientId: number;
  totalBilled: number;
  legacyCollected: number;
  newReceived: number;
  totalReceived: number;
  allocated: number;
  unallocated: number;
  outstanding: number;
  credit: number;
  /** Sum of event-level outstanding (after allocations) across all the client's events. */
  eventOutstanding: number;
};

export type ReceivablesLedger = {
  events: Map<number, EventReceivable>;
  clients: Map<number, ClientReceivable>;
};

function toMoney(value: unknown): number {
  const n = parseFloat(String(value));
  return Number.isFinite(n) ? n : 0;
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Builds the receivables ledger for the given clients (or every client when
 * clientIds is omitted) in a fixed number of queries.
 */
export async function getReceivablesLedger(clientIds?: number[]): Promise<ReceivablesLedger> {
  const events: Map<number, EventReceivable> = new Map();
  const clients: Map<number, ClientReceivable> = new Map();
  if (clientIds?.length === 0) return { events, clients };

  const eventWhere = clientIds ? inArray(eventsTable.clientId, clientIds) : undefined;
  const paymentWhere = clientIds ? inArray(clientPaymentsTable.clientId, clientIds) : undefined;

  const [eventRows, payments] = await Promise.all([
    db.select({ id: eventsTable.id, clientId: eventsTable.clientId }).from(eventsTable).where(eventWhere),
    db.select({ id: clientPaymentsTable.id, clientId: clientPaymentsTable.clientId, amount: clientPaymentsTable.amount })
      .from(clientPaymentsTable)
      .where(paymentWhere),
  ]);

  const eventIds = eventRows.map((e) => e.id);
  const paymentIds = payments.map((p) => p.id);

  const [revenues, allocations] = await Promise.all([
    eventIds.length > 0
      ? db.select().from(eventRevenueTable).where(inArray(eventRevenueTable.eventId, eventIds))
      : Promise.resolve([] as (typeof eventRevenueTable.$inferSelect)[]),
    paymentIds.length > 0
      ? db.select({ paymentId: paymentAllocationsTable.paymentId, eventId: paymentAllocationsTable.eventId, amount: paymentAllocationsTable.amount })
          .from(paymentAllocationsTable)
          .where(inArray(paymentAllocationsTable.paymentId, paymentIds))
      : Promise.resolve([] as { paymentId: number; eventId: number; amount: string }[]),
  ]);

  const revenueByEvent = new Map(revenues.map((r) => [r.eventId, r]));
  const allocatedByEvent = new Map<number, number>();
  const allocatedByPayment = new Map<number, number>();
  for (const a of allocations) {
    const amt = toMoney(a.amount);
    allocatedByEvent.set(a.eventId, (allocatedByEvent.get(a.eventId) ?? 0) + amt);
    allocatedByPayment.set(a.paymentId, (allocatedByPayment.get(a.paymentId) ?? 0) + amt);
  }

  const client = (clientId: number): ClientReceivable => {
    let c = clients.get(clientId);
    if (!c) {
      c = {
        clientId, totalBilled: 0, legacyCollected: 0, newReceived: 0, totalReceived: 0,
        allocated: 0, unallocated: 0, outstanding: 0, credit: 0, eventOutstanding: 0,
      };
      clients.set(clientId, c);
    }
    return c;
  };

  for (const ev of eventRows) {
    const rev = revenueByEvent.get(ev.id);
    const revenue = rev ? toMoney(rev.netRevenue) : 0;
    const legacyCollected = rev ? toMoney(rev.totalCollected) : 0;
    const legacyOutstanding = rev ? toMoney(rev.outstandingAmount) : 0;
    const allocated = allocatedByEvent.get(ev.id) ?? 0;
    const outstanding = round2(Math.max(0, legacyOutstanding - allocated));
    events.set(ev.id, {
      eventId: ev.id,
      clientId: ev.clientId,
      revenue,
      legacyCollected,
      allocated: round2(allocated),
      outstanding,
      dueDate: rev?.dueDate ?? null,
      paymentStatus: rev?.paymentStatus ?? null,
    });
    const c = client(ev.clientId);
    c.totalBilled += revenue;
    c.legacyCollected += legacyCollected;
    c.eventOutstanding += outstanding;
  }

  for (const p of payments) {
    const c = client(p.clientId);
    const amount = toMoney(p.amount);
    const allocated = allocatedByPayment.get(p.id) ?? 0;
    c.newReceived += amount;
    c.allocated += allocated;
    c.unallocated += amount - allocated;
  }

  for (const c of clients.values()) {
    c.totalReceived = c.legacyCollected + c.newReceived;
    const balance = round2(c.totalBilled - c.totalReceived);
    c.outstanding = balance > 0 ? balance : 0;
    c.credit = balance < 0 ? -balance : 0;
    c.totalBilled = round2(c.totalBilled);
    c.legacyCollected = round2(c.legacyCollected);
    c.newReceived = round2(c.newReceived);
    c.totalReceived = round2(c.totalReceived);
    c.allocated = round2(c.allocated);
    c.unallocated = round2(c.unallocated);
    c.eventOutstanding = round2(c.eventOutstanding);
  }

  return { events, clients };
}

/** Total current receivables across all clients (client-level, after every payment). */
export function totalOutstanding(ledger: ReceivablesLedger): number {
  let total = 0;
  for (const c of ledger.clients.values()) total += c.outstanding;
  return round2(total);
}

/**
 * Receivables attributable to a set of events (e.g. a reporting period's
 * events). Per client, the event-level outstanding of the selected events is
 * capped at the client's actual outstanding, so a client-level unallocated
 * payment is never ignored and never pushed onto a specific event.
 */
export function receivablesForEvents(
  ledger: ReceivablesLedger,
  eventIds: number[],
  isOverdue: (e: EventReceivable) => boolean = (e) => e.paymentStatus === "overdue",
): { total: number; overdue: number } {
  const byClient = new Map<number, { total: number; overdue: number }>();
  for (const id of eventIds) {
    const e = ledger.events.get(id);
    if (!e) continue;
    const agg = byClient.get(e.clientId) ?? { total: 0, overdue: 0 };
    agg.total += e.outstanding;
    if (isOverdue(e)) agg.overdue += e.outstanding;
    byClient.set(e.clientId, agg);
  }
  let total = 0;
  let overdue = 0;
  for (const [clientId, agg] of byClient) {
    const cap = ledger.clients.get(clientId)?.outstanding ?? 0;
    const t = Math.min(agg.total, cap);
    total += t;
    overdue += Math.min(agg.overdue, t);
  }
  return { total: round2(total), overdue: round2(overdue) };
}
