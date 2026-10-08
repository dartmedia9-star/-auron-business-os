import { useGetReceivablesSummary, getGetReceivablesSummaryQueryKey } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertCircle, Clock, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function ReceivablesList() {
  const { data, isLoading, isError, error, refetch } = useGetReceivablesSummary({
    query: { queryKey: getGetReceivablesSummaryQueryKey() }
  });

  if (isLoading) {
    return <div className="p-8">Loading receivables...</div>;
  }
  if (isError || !data) {
    return (
      <div className="p-8 space-y-3">
        <p className="text-destructive">Failed to load receivables{error instanceof Error && error.message ? `: ${error.message}` : "."}</p>
        <Button variant="outline" onClick={() => void refetch()}>Try again</Button>
      </div>
    );
  }

  const unallocatedApplied = data.unallocatedPaymentsApplied ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Accounts Receivable</h2>
          <p className="text-muted-foreground mt-1">Track outstanding payments and aging buckets.</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <Card className="bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Outstanding</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(data.totalReceivables)}</div>
            <p className="text-xs text-muted-foreground mt-1">Net of all client payments</p>
          </CardContent>
        </Card>
        
        <Card className="bg-card border-emerald-500/20">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm text-emerald-500">Current / Due Soon</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-500">{formatCurrency(Math.max(0, data.totalReceivables - data.overdue))}</div>
            <p className="text-xs text-muted-foreground mt-1">Due within 30 days</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-amber-500/20">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm text-amber-500">1-30 Days Overdue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-500">{formatCurrency(data.overdue30)}</div>
          </CardContent>
        </Card>

        <Card className="bg-card border-orange-500/20">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm text-orange-500">31-60 Days Overdue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-500">{formatCurrency(data.overdue60)}</div>
          </CardContent>
        </Card>

        <Card className="bg-card border-red-500/20">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm text-red-500">90+ Days Overdue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">{formatCurrency(data.overdue90)}</div>
          </CardContent>
        </Card>
      </div>

      {unallocatedApplied > 0 && (
        <p className="text-sm text-muted-foreground">
          {formatCurrency(unallocatedApplied)} of client-level payments is not allocated to specific events. It reduces each client's outstanding below, but the aging buckets and event list are shown per event before it.
        </p>
      )}

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>By Client</CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead className="text-right">Total Revenue</TableHead>
                  <TableHead className="text-right">Total Received</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.byClient.length > 0 ? (
                  data.byClient.map(c => (
                    <TableRow key={c.clientId}>
                      <TableCell className="font-medium">
                        <Link href={`/clients/${c.clientId}`} className="hover:text-primary transition-colors">{c.clientName}</Link>
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(c.totalBilled ?? null)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(c.totalReceived ?? null)}</TableCell>
                      <TableCell className="text-right">
                        {(c.credit ?? 0) > 0 ? (
                          <span className="font-bold text-emerald-500" title="Received more than billed">{formatCurrency(c.credit)} credit</span>
                        ) : (
                          <span className="font-bold text-amber-500">{formatCurrency(c.outstanding)}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow><TableCell colSpan={4} className="text-center h-24 text-muted-foreground">No outstanding balances.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>By Event invoice</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead className="text-right">Outstanding Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.byEvent.length > 0 ? (
                  data.byEvent.map(e => (
                    <TableRow key={e.eventId}>
                      <TableCell className="font-medium">{e.eventName}</TableCell>
                      <TableCell>{e.dueDate ? new Date(e.dueDate).toLocaleDateString() : '—'}</TableCell>
                      <TableCell className="text-right font-bold text-amber-500">{formatCurrency(e.outstanding)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow><TableCell colSpan={3} className="text-center h-24 text-muted-foreground">No outstanding invoices.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
