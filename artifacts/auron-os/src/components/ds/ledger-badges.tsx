import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Receipt, RotateCcw, SlidersHorizontal, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

type TypeMeta = { label: string; icon: typeof Wallet; className: string };

// One label/icon/colour per fund ledger type, used everywhere a transaction
// is shown so "Money Received" always looks the same.
export const LEDGER_TYPE_META: Record<string, TypeMeta> = {
  client_payment: { label: "Money Received", icon: ArrowDownLeft, className: "bg-success/10 text-success ring-success/20" },
  client_payment_reversal: { label: "Payment Reversal", icon: RotateCcw, className: "bg-destructive/10 text-destructive ring-destructive/20" },
  expense: { label: "Expense", icon: Receipt, className: "bg-destructive/10 text-destructive ring-destructive/20" },
  expense_reversal: { label: "Expense Reversal", icon: RotateCcw, className: "bg-success/10 text-success ring-success/20" },
  transfer_in: { label: "Transfer In", icon: ArrowLeftRight, className: "bg-info/10 text-info ring-info/20" },
  transfer_out: { label: "Transfer Out", icon: ArrowLeftRight, className: "bg-info/10 text-info ring-info/20" },
  adjustment: { label: "Adjustment", icon: SlidersHorizontal, className: "bg-muted text-muted-foreground ring-border" },
};

export function ledgerTypeLabel(type: string): string {
  return LEDGER_TYPE_META[type]?.label ?? type;
}

export function LedgerTypeBadge({ type, className }: { type: string; className?: string }) {
  const meta = LEDGER_TYPE_META[type] ?? { label: type, icon: Wallet, className: "bg-muted text-muted-foreground ring-border" };
  const Icon = meta.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", meta.className, className)}>
      <Icon className="h-3 w-3" aria-hidden />
      {meta.label}
    </span>
  );
}

const STATUS_META: Record<string, { label: string; className: string; hint: string }> = {
  posted: { label: "Posted", className: "text-success", hint: "This entry's effect on the fund stands." },
  reversed: { label: "Reversed", className: "text-muted-foreground line-through decoration-1", hint: "A later reversal undid this entry (edited or deleted)." },
  reversal: { label: "Reversal", className: "text-warning", hint: "This entry undoes an earlier one." },
};

export function LedgerStatus({ status, className }: { status: string; className?: string }) {
  const meta = STATUS_META[status] ?? { label: status, className: "", hint: "" };
  return (
    <span title={meta.hint} className={cn("inline-flex items-center gap-1.5 text-xs font-medium", meta.className, className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full bg-current", status === "reversed" && "opacity-60")} aria-hidden />
      {meta.label}
    </span>
  );
}

export function DirectionIcon({ direction, internal }: { direction: "in" | "out"; internal?: boolean }) {
  const Icon = internal ? ArrowLeftRight : direction === "in" ? ArrowDownLeft : ArrowUpRight;
  return (
    <span
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
        internal ? "bg-info/10 text-info" : direction === "in" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive",
      )}
      aria-hidden
    >
      <Icon className="h-4 w-4" />
    </span>
  );
}
