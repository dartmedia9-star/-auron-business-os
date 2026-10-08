import { useGetPerformanceMonthlyCashflow } from "@workspace/api-client-react";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowUpDown, ArrowUpCircle, ArrowDownCircle, Repeat } from "lucide-react";
import { Link, useParams } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";

const MONTH_NAMES = [
  "", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  expense: { label: "Expense", color: "text-red-500" },
  expense_reversal: { label: "Reversal", color: "text-emerald-500" },
  transfer_in: { label: "Transfer In", color: "text-emerald-500" },
  transfer_out: { label: "Transfer Out", color: "text-red-500" },
  adjustment: { label: "Adjustment", color: "text-amber-500" },
  client_payment: { label: "Client Payment", color: "text-emerald-500" },
  client_payment_reversal: { label: "Payment Reversal", color: "text-red-500" },
};

export default function PerformanceCashflow() {
  const params = useParams<{ year: string; month: string }>();
  const year = parseInt(params.year ?? String(new Date().getFullYear()), 10);
  const month = parseInt(params.month ?? "1", 10);

  const { data, isLoading } = useGetPerformanceMonthlyCashflow({ year, month });

  if (isLoading || !data) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto">
        <Skeleton className="h-12 w-80" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-4">
        <Link href={`/performance/${year}/${month}`}>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h2 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <ArrowUpDown className="h-7 w-7 text-teal-500" />
            Cash Flow
          </h2>
          <p className="text-muted-foreground mt-1">{MONTH_NAMES[month]} {year} — Fund account activity</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <ArrowUpCircle className="h-4 w-4 text-emerald-500" />
              <p className="text-sm text-muted-foreground">Cash In</p>
            </div>
            <p className="text-2xl font-bold text-emerald-500">{formatCurrency(data.totalCashIn)}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-500">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <ArrowDownCircle className="h-4 w-4 text-red-500" />
              <p className="text-sm text-muted-foreground">Cash Out</p>
            </div>
            <p className="text-2xl font-bold text-red-500">{formatCurrency(data.totalCashOut)}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Repeat className="h-4 w-4 text-amber-500" />
              <p className="text-sm text-muted-foreground">Transfers</p>
            </div>
            <p className="text-2xl font-bold text-amber-500">{formatCurrency(data.totalTransfers)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{data.transferCount} transfer{data.transferCount !== 1 ? "s" : ""}</p>
          </CardContent>
        </Card>
      </div>

      {data.transfers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Fund Transfers (Not P&L Impact)</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>From</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.transfers.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>{t.fromAccount}</TableCell>
                      <TableCell>{t.toAccount}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(t.amount)}</TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(t.date)}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{t.description || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Fund Transactions</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {data.transactions.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              No fund transactions for this month.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Money In</TableHead>
                    <TableHead className="text-right">Money Out</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.transactions.map((t) => {
                    const typeInfo = TYPE_LABELS[t.type] ?? { label: t.type, color: "text-muted-foreground" };
                    return (
                      <TableRow key={t.id}>
                        <TableCell className="font-medium">{t.accountName}</TableCell>
                        <TableCell>
                          <span className={cn("text-sm font-medium", typeInfo.color)}>
                            {typeInfo.label}
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-emerald-500">
                          {t.moneyIn > 0 ? formatCurrency(t.moneyIn) : "—"}
                        </TableCell>
                        <TableCell className="text-right text-red-500">
                          {t.moneyOut > 0 ? formatCurrency(t.moneyOut) : "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                          {t.description || "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {formatDate(String(t.transactionDate ?? t.createdAt))}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
