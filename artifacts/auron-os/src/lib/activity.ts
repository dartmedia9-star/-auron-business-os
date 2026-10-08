import type { AuditLog } from "@workspace/api-client-react";
import { formatMoney } from "./money";

/*
 * Turns an audit_logs row into a readable line for activity feeds. Only the
 * shapes the API actually writes are recognised (client payments, payment
 * allocations, expenses, fund transfers, fund accounts); anything else falls
 * back to a generic "<thing> <action>" line. Raw JSON is never shown.
 */
export type ActivityKind = "in" | "out" | "internal" | "neutral" | "warning";

export type ActivityLine = {
  title: string;
  detail: string | null;
  amount: number | null;
  kind: ActivityKind;
  href: string | null;
};

type Lookup = {
  clientName: (id: number) => string | undefined;
  fundName: (id: number) => string | undefined;
};

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);

const ENTITY_LABEL: Record<string, string> = {
  client_payment: "Client payment",
  payment_allocation: "Payment allocation",
  operating_expense: "Expense",
  fund_transfer: "Fund transfer",
  fund_account: "Fund account",
};

const PAST: Record<string, string> = { create: "added", update: "updated", delete: "deleted" };

export function describeAuditLog(log: AuditLog, lookup: Lookup): ActivityLine {
  const values = (log.newValues ?? log.oldValues ?? {}) as Record<string, unknown>;
  const action = log.action;

  switch (log.entityType) {
    case "client_payment": {
      const clientId = num(values.clientId);
      const client = clientId != null ? lookup.clientName(clientId) : undefined;
      const amount = num(values.amount);
      const title = action === "create" ? "Payment received" : action === "delete" ? "Payment deleted" : "Payment edited";
      return {
        title,
        detail: client ?? null,
        amount,
        kind: action === "delete" ? "warning" : "in",
        href: clientId != null ? `/clients/${clientId}` : "/finance/receivables",
      };
    }
    case "payment_allocation":
      return { title: "Payment allocation changed", detail: `Payment #${log.entityId}`, amount: null, kind: "neutral", href: "/finance/receivables" };
    case "operating_expense": {
      const amount = num(values.amount);
      const gst = num(values.gst) ?? 0;
      const label = str(values.description) ?? str(values.category);
      const title = action === "create" ? "Expense added" : action === "delete" ? "Expense deleted" : "Expense updated";
      return {
        title,
        detail: label,
        amount: amount != null ? amount + gst : null,
        kind: action === "delete" ? "warning" : "out",
        href: "/finance/expenses",
      };
    }
    case "fund_transfer": {
      const from = num(values.from_account_id ?? values.fromAccountId);
      const to = num(values.to_account_id ?? values.toAccountId);
      const fromName = from != null ? lookup.fundName(from) : undefined;
      const toName = to != null ? lookup.fundName(to) : undefined;
      return {
        title: "Fund transfer",
        detail: fromName && toName ? `${fromName} to ${toName}` : null,
        amount: num(values.amount),
        kind: "internal",
        href: "/fund-transfers",
      };
    }
    case "fund_account":
      return {
        title: action === "delete" ? "Fund account removed" : action === "create" ? "Fund account created" : "Fund account updated",
        detail: str(values.name),
        amount: null,
        kind: "neutral",
        href: "/fund-transfers",
      };
    default: {
      const label = ENTITY_LABEL[log.entityType] ?? log.entityType.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
      return { title: `${label} ${PAST[action] ?? action}`, detail: null, amount: null, kind: "neutral", href: null };
    }
  }
}

export function activityAmountText(line: ActivityLine): string | null {
  return line.amount == null ? null : formatMoney(line.amount);
}
