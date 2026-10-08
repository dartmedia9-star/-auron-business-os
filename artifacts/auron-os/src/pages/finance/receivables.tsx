import { useGetReceivablesSummary, getGetReceivablesSummaryQueryKey } from "@workspace/api-client-react";
import { AlertTriangle, CalendarClock, Clock, Plus, ReceiptIndianRupee } from "lucide-react";
import { Link } from "wouter";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ds/page-header";
import { KpiCard } from "@/components/ds/kpi-card";
import { Money, formatINR } from "@/components/ds/money";
import { CardsSkeleton, EmptyState, ErrorState, TableSkeleton } from "@/components/ds/states";
import { useNewTransaction } from "@/components/new-transaction";
import { formatDate } from "@/lib/utils";

/*
 * Receivables from the shared client receivables ledger: billed revenue less
 * legacy event collections and every client payment. Client-level payments
 * reduce the client's outstanding but are not tied to an event's due date.
 */
export default function ReceivablesList() {
  const newTransaction = useNewTransaction();
  const { data, isLoading, isError, error, refetch } = useGetReceivablesSummary({
    query: { queryKey: getGetReceivablesSummaryQueryKey() },
  });

  const header = (
    <PageHeader
      eyebrow="Finance"
      title="Receivables"
      description="What clients still owe, net of every payment received."
      actions={<Button onClick={() => newTransaction.open()}><Plus className="mr-2 h-4 w-4" /> Record Money Received</Button>}
    />
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        {header}
        <CardsSkeleton count={4} />
        <div className="rounded-xl border bg-card"><TableSkeleton rows={5} cols={4} /></div>
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="space-y-6">
        {header}
        <ErrorState title="Couldn't load receivables" error={error} onRetry={() => void refetch()} />
      </div>
    );
  }

  const unallocatedApplied = data.unallocatedPaymentsApplied ?? 0;

  return (
    <div className="space-y-6">
      {header}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Total outstanding" value={data.totalReceivables} icon={ReceiptIndianRupee} tone="primary" hint="Net of all client payments" />
        <KpiCard label="Not yet overdue" value={Math.max(0, data.totalReceivables - data.overdue)} icon={CalendarClock} tone="in" hint={`${formatINR(data.dueThisWeek)} due this week`} />
        <KpiCard label="Overdue" value={data.overdue} icon={Clock} tone={data.overdue > 0 ? "warning" : "neutral"} hint={`${formatINR(data.overdue30)} over 30 days`} />
        <KpiCard label="Over 90 days" value={data.overdue90} icon={AlertTriangle} tone={data.overdue90 > 0 ? "out" : "neutral"} hint={`${formatINR(data.overdue60)} over 60 days`} />
      </div>

      {unallocatedApplied > 0 && (
        <p className="rounded-lg bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
          {formatINR(unallocatedApplied)} of client-level payments is not allocated to specific events. It reduces each client's outstanding below; the aging and event list show each event before it.
        </p>
      )}

      <section className="rounded-xl border bg-card shadow-card">
        <div className="border-b p-4 sm:p-5"><h3 className="text-base font-semibold">By client</h3></div>
        {data.byClient.length === 0 ? (
          <div className="p-4"><EmptyState title="Nothing outstanding" description="Every client is fully paid." /></div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Client</TableHead>
                  <TableHead className="text-right">Invoiced (incl. GST)</TableHead>
                  <TableHead className="text-right">Received</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead className="w-[1%]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.byClient.map((c) => (
                  <TableRow key={c.clientId}>
                    <TableCell className="font-medium">
                      <Link href={`/clients/${c.clientId}`} className="transition-colors hover:text-primary">{c.clientName}</Link>
                    </TableCell>
                    <TableCell className="text-right"><Money value={c.totalBilled ?? 0} tone="neutral" exact={false} /></TableCell>
                    <TableCell className="text-right"><Money value={c.totalReceived ?? 0} tone="neutral" exact={false} /></TableCell>
                    <TableCell className="text-right font-semibold">
                      {(c.credit ?? 0) > 0 ? (
                        <span className="text-money-in" title="Received more than invoiced">{formatINR(c.credit)} credit</span>
                      ) : (
                        <span className="text-warning">{formatINR(c.outstanding)}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {c.outstanding > 0 && (
                        <Button variant="ghost" size="sm" className="h-8 whitespace-nowrap" onClick={() => newTransaction.open({ kind: "money_received", clientId: c.clientId })}>
                          Record payment
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="rounded-xl border bg-card shadow-card">
        <div className="border-b p-4 sm:p-5"><h3 className="text-base font-semibold">By event invoice</h3></div>
        {data.byEvent.length === 0 ? (
          <div className="p-4"><EmptyState title="No outstanding invoices" /></div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Event</TableHead>
                  <TableHead>Due date</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.byEvent.map((e) => {
                  const overdue = !!e.dueDate && new Date(e.dueDate) < new Date(new Date().toDateString());
                  return (
                    <TableRow key={e.eventId}>
                      <TableCell className="font-medium">
                        <Link href={`/events/${e.eventId}`} className="transition-colors hover:text-primary">{e.eventName}</Link>
                      </TableCell>
                      <TableCell className={overdue ? "text-money-out" : "text-muted-foreground"}>
                        {e.dueDate ? formatDate(e.dueDate) : "—"}{overdue ? " · overdue" : ""}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-warning tabular-nums">{formatINR(e.outstanding)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
