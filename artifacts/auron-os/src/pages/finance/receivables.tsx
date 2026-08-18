import { useGetReceivablesSummary, getGetReceivablesSummaryQueryKey } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertCircle, Clock, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function ReceivablesList() {
  const { data, isLoading } = useGetReceivablesSummary({
    query: { queryKey: getGetReceivablesSummaryQueryKey() }
  });

  if (isLoading || !data) {
    return <div className="p-8">Loading receivables...</div>;
  }

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
          </CardContent>
        </Card>
        
        <Card className="bg-card border-emerald-500/20">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm text-emerald-500">Current / Due Soon</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-500">{formatCurrency(data.totalReceivables - data.overdue)}</div>
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

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>By Client</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client Name</TableHead>
                  <TableHead className="text-right">Outstanding Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.byClient.length > 0 ? (
                  data.byClient.map(c => (
                    <TableRow key={c.clientId}>
                      <TableCell className="font-medium">{c.clientName}</TableCell>
                      <TableCell className="text-right font-bold text-amber-500">{formatCurrency(c.outstanding)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow><TableCell colSpan={2} className="text-center h-24 text-muted-foreground">No outstanding balances.</TableCell></TableRow>
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
