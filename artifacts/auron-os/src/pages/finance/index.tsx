import { useState } from "react";
import { Link } from "wouter";
import {
  useGetFinanceSummary,
  getGetFinanceSummaryQueryKey,
  useGetPerformanceYears,
  getGetPerformanceYearsQueryKey,
} from "@workspace/api-client-react";
import { ArrowRight, Banknote, Info, Landmark, Plus, ReceiptIndianRupee, TrendingUp, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/ds/page-header";
import { KpiCard } from "@/components/ds/kpi-card";
import { AnimatedNumber } from "@/components/ds/animated-number";
import { Money, formatINR } from "@/components/ds/money";
import { CardsSkeleton, ErrorState } from "@/components/ds/states";
import { useNewTransaction } from "@/components/new-transaction";
import { formatPercentage, cn } from "@/lib/utils";

/*
 * Finance Summary. Two separate pictures, never mixed:
 *   P&L   — revenue billed on events (by event date) less costs; no cash.
 *   Cash  — fund balances, which only Money Received, expenses and transfers move.
 */
export default function FinanceSummary() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const newTransaction = useNewTransaction();

  const params = { year };
  const { data, isLoading, isError, error, refetch } = useGetFinanceSummary(params, {
    query: { queryKey: getGetFinanceSummaryQueryKey(params) },
  });
  const years = useGetPerformanceYears({ query: { queryKey: getGetPerformanceYearsQueryKey() } });
  const yearOptions = Array.from(new Set([currentYear, ...(years.data?.years ?? [])])).sort((a, b) => b - a);

  const header = (
    <PageHeader
      eyebrow="Finance"
      title="Finance Summary"
      description="Profit and loss for the year, and where the company's cash sits today."
      actions={
        <>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-28" aria-label="Year"><SelectValue /></SelectTrigger>
            <SelectContent>{yearOptions.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
          </Select>
          <Button onClick={() => newTransaction.open()}>
            <Plus className="mr-2 h-4 w-4" /> New Transaction
          </Button>
        </>
      }
    />
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        {header}
        <CardsSkeleton count={4} />
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="h-80 animate-pulse rounded-xl border bg-card lg:col-span-3" />
          <div className="h-80 animate-pulse rounded-xl border bg-card lg:col-span-2" />
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="space-y-6">
        {header}
        <ErrorState title="Couldn't load the finance summary" error={error} onRetry={() => void refetch()} />
      </div>
    );
  }

  const fundAccounts = data.fundAccounts ?? [];
  const totalFunds = fundAccounts.reduce((sum, account) => sum + account.balance, 0);
  const maxBar = Math.max(data.revenue, 1);

  const waterfall: Array<{ label: string; value: number; kind: "total" | "less" | "result"; hint?: string }> = [
    { label: "Revenue", value: data.revenue, kind: "total", hint: "Billed on events dated this year" },
    { label: "Direct costs", value: data.directCosts, kind: "less", hint: "Vendor and event-linked costs incl. GST" },
    { label: "Gross profit", value: data.grossProfit, kind: "result", hint: `Margin ${formatPercentage(data.grossMarginPct)}` },
    { label: "Operating expenses", value: data.operatingExpenses, kind: "less", hint: "Overheads, excl. GST" },
    { label: "EBITDA", value: data.ebitda, kind: "result", hint: `Margin ${formatPercentage(data.ebitdaMarginPct)}` },
    { label: "Net profit", value: data.netProfit, kind: "result", hint: `Margin ${formatPercentage(data.netMarginPct)}` },
  ];

  return (
    <div className="space-y-6">
      {header}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Revenue (billed)" value={data.revenue} icon={TrendingUp} tone="primary" hint={`${year} events`} href={`/performance/${year}`} />
        <KpiCard label="Gross profit" value={data.grossProfit} icon={Banknote} tone={data.grossProfit < 0 ? "out" : "in"} hint={`Margin ${formatPercentage(data.grossMarginPct)}`} />
        <KpiCard label="EBITDA" value={data.ebitda} icon={Landmark} tone={data.ebitda < 0 ? "out" : "in"} hint={`Margin ${formatPercentage(data.ebitdaMarginPct)}`} />
        <KpiCard
          label="Receivables"
          value={data.totalReceivables ?? 0}
          icon={ReceiptIndianRupee}
          tone={(data.overdueReceivables ?? 0) > 0 ? "warning" : "neutral"}
          hint={(data.overdueReceivables ?? 0) > 0 ? `${formatINR(data.overdueReceivables)} overdue` : "Still to collect"}
          href="/finance/receivables"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <section className="rounded-xl border bg-card p-5 shadow-card lg:col-span-3">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-base font-semibold">Profit &amp; loss</h3>
            <span className="text-xs text-muted-foreground">{year} · accrual, no cash</span>
          </div>
          <ol className="mt-4 space-y-1">
            {waterfall.map((row) => {
              const width = `${Math.min(100, (Math.abs(row.value) / maxBar) * 100)}%`;
              const negative = row.kind === "result" && row.value < 0;
              return (
                <li key={row.label} className={cn("rounded-lg px-3 py-2.5", row.kind === "result" && "bg-muted/50")}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className={cn("text-sm", row.kind === "result" ? "font-semibold" : "text-muted-foreground", row.kind === "less" && "pl-4")}>
                        {row.kind === "less" ? "− " : ""}{row.label}
                      </p>
                      {row.hint && <p className={cn("text-xs text-muted-foreground", row.kind === "less" && "pl-4")}>{row.hint}</p>}
                    </div>
                    <span className={cn("text-right tabular-nums", row.kind === "result" ? "text-lg font-semibold" : "text-sm font-medium", negative && "text-money-out", row.kind === "less" && "text-muted-foreground")}>
                      {row.kind === "less" ? "−" : ""}{formatINR(Math.abs(row.value))}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        "h-full rounded-full transition-[width] duration-700 ease-out",
                        row.kind === "total" && "bg-primary",
                        row.kind === "less" && "bg-destructive/50",
                        row.kind === "result" && (negative ? "bg-destructive" : "bg-success"),
                      )}
                      style={{ width }}
                    />
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        <section className="flex flex-col rounded-xl border bg-card p-5 shadow-card lg:col-span-2">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-base font-semibold">Cash position</h3>
            <Link href="/fund-transfers" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              Funds <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <p className="mt-3 text-xs uppercase tracking-wide text-muted-foreground">Total available today</p>
          <AnimatedNumber value={totalFunds} format={(n) => formatINR(n)} className="block text-3xl font-semibold tabular-nums tracking-tight" />

          {fundAccounts.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              No fund accounts yet. Create one on the <Link href="/fund-transfers" className="text-primary hover:underline">Funds</Link> page.
            </div>
          ) : (
            <ul className="mt-4 space-y-3">
              {fundAccounts.map((account) => {
                const share = totalFunds > 0 ? Math.max(0, account.balance) / totalFunds : 0;
                return (
                  <li key={account.id}>
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <Wallet className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">{account.name}</span>
                      </span>
                      <Money value={account.balance} tone={account.balance < 0 ? "out" : "neutral"} exact={false} className="font-medium" />
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary/70 transition-[width] duration-700 ease-out" style={{ width: `${share * 100}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-auto pt-5">
            <div className="flex gap-2 rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <p>Revenue never changes a fund. Funds move only when money is received from a client, an expense is paid, or money is transferred between funds.</p>
            </div>
            <Button variant="outline" className="mt-3 w-full" onClick={() => newTransaction.open()}>
              <Plus className="mr-2 h-4 w-4" /> Record money received
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
