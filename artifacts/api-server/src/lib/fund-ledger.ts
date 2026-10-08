import type { db } from "@workspace/db";

// ---------------------------------------------------------------------------
// Fund ledger rules: single source of truth
//
// transaction_type        | effect on the fund's balance
// ------------------------+------------------------------------------------------
// client_payment          | +amount   CASH IN   (client money received)
// client_payment_reversal | -amount   CASH OUT  (client payment reversed/edited)
// expense                 | -amount   CASH OUT  (expense paid from the fund)
// expense_reversal        | +amount   CASH IN   (reversal/correction of an expense)
// transfer_out            | -amount   INTERNAL  (sent to another fund account)
// transfer_in             | +amount   INTERNAL  (received from another fund account)
// adjustment              | ±amount   signed value (positive = in, negative = out)
//
// Stored amounts always represent the actual cash movement (expenses include
// GST). Balance = account.opening_balance + sum(signed effects). Unknown types
// contribute 0 so legacy/noise rows cannot silently corrupt balances.
//
// Transfers move money between the company's own funds: they change each
// fund's balance but are never cash in/out for the business, revenue or
// expense. Revenue (event_revenue) never writes to this ledger.
// ---------------------------------------------------------------------------

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
/** Anything that can run a select: the pool or an open transaction. */
export type DbExecutor = Pick<typeof db, "select">;

export const LEDGER_TYPES = [
  "client_payment",
  "client_payment_reversal",
  "expense",
  "expense_reversal",
  "transfer_in",
  "transfer_out",
  "adjustment",
] as const;
export type LedgerType = (typeof LEDGER_TYPES)[number];

export const TRANSFER_TYPES: ReadonlySet<string> = new Set(["transfer_in", "transfer_out"]);
export const REVERSAL_TYPES: ReadonlySet<string> = new Set(["client_payment_reversal", "expense_reversal"]);

export function toMoney(value: unknown): number {
  const n = parseFloat(String(value));
  return Number.isFinite(n) ? n : 0;
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function signedEffect(transactionType: string, amount: number): number {
  switch (transactionType) {
    case "expense":
    case "transfer_out":
    case "client_payment_reversal":
      return -amount;
    case "expense_reversal":
    case "transfer_in":
    case "client_payment":
    case "adjustment":
      return amount;
    default:
      return 0;
  }
}

/** True for internal fund-to-fund movements, which are not business cash in/out. */
export function isInternalTransfer(transactionType: string): boolean {
  return TRANSFER_TYPES.has(transactionType);
}

export function computeBalance(openingBalance: unknown, transactions: Array<{ transaction_type: string; amount: unknown }>): number {
  let balance = toMoney(openingBalance);
  for (const t of transactions) {
    balance += signedEffect(t.transaction_type, toMoney(t.amount));
  }
  return round2(balance);
}

const MONEY_TEXT = new Intl.NumberFormat("en-US", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** ₹10,000.00: same display format as the web app, for messages the server writes. */
export function formatMoneyText(value: number): string {
  return MONEY_TEXT.format(round2(value));
}

/**
 * Net client receipts: cash collected from clients, the one rule shared by
 * the monthly cash flow and the annual performance views. Sums client_payment
 * inflows minus client_payment_reversal outflows; callers pick the ledger rows
 * by transaction_date (the payment's business date). Not revenue.
 */
export function summarizeClientReceipts(rows: Array<{ transaction_type: string; amount: unknown }>): {
  clientPaymentTotal: number;
  clientPaymentReversalTotal: number;
  netClientReceipts: number;
} {
  let paid = 0;
  let reversed = 0;
  for (const r of rows) {
    const effect = signedEffect(r.transaction_type, toMoney(r.amount));
    if (r.transaction_type === "client_payment" && effect > 0) paid += effect;
    else if (r.transaction_type === "client_payment_reversal" && effect < 0) reversed += -effect;
  }
  const clientPaymentTotal = round2(paid);
  const clientPaymentReversalTotal = round2(reversed);
  return { clientPaymentTotal, clientPaymentReversalTotal, netClientReceipts: round2(clientPaymentTotal - clientPaymentReversalTotal) };
}
