import { useState } from "react";
import { useGetPerformanceMonthlyCashflow, getGetPerformanceMonthlyCashflowQueryKey } from "@workspace/api-client-react";
import { formatDate, cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ArrowDownLeft, ArrowLeft, ArrowLeftRight, ArrowUpRight, Scale, Users } from "lucide-react";
import { Link, useParams } from "wouter";
import { PageHeader } from "@/components/ds/page-header";
import { KpiCard } from "@/components/ds/kpi-card";
import { Money, formatINR } from "@/components/ds/money";
import { CardsSkeleton, EmptyState, ErrorState, TableSkeleton } from "@/components/ds/states";
import { LedgerTypeBadge } from "@/components/ds/ledger-badges";
import { LedgerEntrySheet } from "@/components/fund-ledger";

const MONTH_NAMES = [
  "", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/*
 * Monthly cash flow from the fund ledger, by payment / transaction date.
 * Cash in and cash out are business cash only; transfers between the
 * company's own funds are shown separately as internal and never counted.
 * Revenue billed in the month is not cash and does not appear here.
 */
export default function PerformanceCashflow() {
  const params = useParams<{ year: string; month: string }>();
  const year = parseInt(params.year ?? String(new Date().getFullYear()), 10);
  const month = parseInt(params.month ?? "1", 10);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const query = { year, month };
  const { data, isLoading, isError, error, refetch } = useGetPerformanceMonthlyCashflow(query, {
    query: { queryKey: getGetPerformanceMonthlyCashflowQueryKey(query) },
  });

  const header = (
    <div className="flex items-start gap-3">
      <Link href={`/performance/${year}/${month}`}>
        <Button variant="ghost" size="icon" className="mt-1 h-8 w-8" aria-label="Back to month">
          <ArrowLeft className="h-4 w-4" />
        </Button>
      </Link>
      <PageHeader
        className="flex-1"
        eyebrow={`${MONTH_NAMES[month]} ${year}`}
        title="Cash Flow"
        description="Actual money in and out of the funds, by payment date. Revenue billed is not cash and is not shown here."
      />
    </div>
  );

  if (isLoading) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        {header}
        <CardsSkeleton count={4} />
        <div className="rounded-xl border bg-card"><TableSkeleton rows={6} cols={6} /></div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        {header}
        <ErrorState title="Couldn't load cash flow" error={error} onRetry={() => void refetch()} />
      </div>
    );
  }

  const netCash = data.netCashFlow ?? data.totalCashIn - data.totalCashOut;
  const cashRows = data.transactions.filter((t) => !t.isInternalTransfer);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {header}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Cash in" value={data.totalCashIn} icon={ArrowDownLeft} tone="in" hint={`Client receipts ${formatINR(data.netClientReceipts ?? data.clientPaymentTotal ?? 0)} net`} />
        <KpiCard label="Cash out" value={data.totalCashOut} icon={ArrowUpRight} tone="out" hint="Expenses and reversals" />
        <KpiCard label="Net cash flow" value={netCash} icon={Scale} tone={netCash < 0 ? "out" : "in"} />
        <KpiCard label="Internal transfers" value={data.totalTransfers} icon={ArrowLeftRight} tone="info" hint={`${data.transferCount} transfer${data.transferCount !== 1 ? "s" : ""} · not cash in/out`} />
      </div>

      <section className="rounded-xl border bg-card shadow-card">
        <div className="flex flex-col gap-1 border-b p-4 sm:flex-row sm:items-baseline sm:justify-between sm:p-5">
          <h3 className="text-base font-semibold">Cash movements</h3>
          <p className="text-xs text-muted-foreground">{cashRows.length} entr{cashRows.length === 1 ? "y" : "ies"} counted in cash in/out</p>
        </div>
        {data.transactions.length === 0 ? (
          <div className="p-4"><EmptyState title="No fund activity this month" description="Money received, expenses and transfers dated in this month appear here." /></div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Fund</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.transactions.map((t) => (
                  <TableRow key={t.id} className={cn("cursor-pointer", t.isInternalTransfer && "bg-muted/30")} onClick={() => setSelectedId(t.id)}>
                    <TableCell className="whitespace-nowrap text-sm tabular-nums">{formatDate(String(t.transactionDate ?? t.createdAt))}</TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        <LedgerTypeBadge type={t.type} />
                        {t.isInternalTransfer && <span className="text-[11px] text-muted-foreground">Internal, not counted</span>}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[260px] truncate text-sm text-muted-foreground">{t.description || "—"}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{t.accountName}</TableCell>
                    <TableCell className="text-right font-semibold">
                      <Money value={t.moneyIn > 0 ? t.moneyIn : -t.moneyOut} signed tone={t.isInternalTransfer ? "neutral" : "auto"} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border bg-card shadow-card">
          <div className="flex items-center gap-2 border-b p-4 sm:p-5">
            <Users className="h-4 w-4 text-success" />
            <h3 className="text-base font-semibold">Money received from clients</h3>
          </div>
          {(data.clientPayments ?? []).length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">No client payments dated in this month.</p>
          ) : (
            <ul className="divide-y">
              {(data.clientPayments ?? []).map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm sm:px-5">
                  <div className="min-w-0">
                    {p.clientId ? (
                      <Link href={`/clients/${p.clientId}`} className="truncate font-medium hover:underline">{p.clientName ?? `Client #${p.clientId}`}</Link>
                    ) : (
                      <span className="font-medium">Payment #{p.id}</span>
                    )}
                    <p className="truncate text-xs text-muted-foreground">
                      {formatDate(p.paymentDate)} · {p.fundAccountName ?? "—"}{p.paymentMethod ? ` · ${p.paymentMethod}` : ""}{p.reference ? ` · ${p.reference}` : ""}
                    </p>
                  </div>
                  <Money value={p.amount} signed className="font-semibold" />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border bg-card shadow-card">
          <div className="flex items-center gap-2 border-b p-4 sm:p-5">
            <ArrowLeftRight className="h-4 w-4 text-info" />
            <h3 className="text-base font-semibold">Internal transfers</h3>
          </div>
          {data.transfers.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">No transfers between funds this month.</p>
          ) : (
            <ul className="divide-y">
              {data.transfers.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm sm:px-5">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{t.fromAccount} → {t.toAccount}</p>
                    <p className="truncate text-xs text-muted-foreground">{formatDate(t.date)} · {t.description || "No description"}</p>
                  </div>
                  <Money value={t.amount} tone="neutral" className="font-semibold" />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <LedgerEntrySheet entryId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}
