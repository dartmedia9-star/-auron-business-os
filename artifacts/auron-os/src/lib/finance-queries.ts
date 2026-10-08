import type { QueryClient } from "@tanstack/react-query";

// Every query a money movement can change: funds, the fund ledger, transfers,
// client receivables and payments, events (received/outstanding), finance
// summary, performance/cash flow, dashboard and the audit trail. Revenue and
// profit numbers do not change, but they share these endpoints.
const FINANCE_PREFIXES = [
  "/api/fund-accounts",
  "/api/fund-transactions",
  "/api/fund-transfers",
  "/api/clients",
  "/api/payments",
  "/api/finance",
  "/api/events",
  "/api/performance",
  "/api/dashboard",
  "/api/audit-logs",
];

export function invalidateFinance(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({
    predicate: (q) => typeof q.queryKey[0] === "string" && FINANCE_PREFIXES.some((p) => (q.queryKey[0] as string).startsWith(p)),
  });
}

/** Today's date (YYYY-MM-DD) on this device. */
export function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const PAYMENT_METHODS = ["Bank Transfer", "UPI", "Cheque", "Cash", "Card", "Other"];

export function newSubmissionKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
