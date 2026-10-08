import { useMemo, useState } from "react";
import { PageHeader } from "@/components/ds/page-header";
import { useGetPerformanceMonthlyRevenue } from "@workspace/api-client-react";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { Input } from "@/components/ui/input";
import { ArrowUp, Search } from "lucide-react";
import { Link, useParams } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";

const MONTH_NAMES = [
  "", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function PerformanceRevenue() {
  const params = useParams<{ year: string; month: string }>();
  const year = parseInt(params.year ?? String(new Date().getFullYear()), 10);
  const month = parseInt(params.month ?? "1", 10);

  const { data, isLoading } = useGetPerformanceMonthlyRevenue({ year, month });
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!data?.revenue) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data.revenue;
      return data.revenue.filter((r) =>
      (r.eventName ?? "").toLowerCase().includes(q) ||
      (r.clientName ?? "").toLowerCase().includes(q) ||
      (r.invoiceNumber ?? "").toLowerCase().includes(q) ||
      (r.paymentStatus ?? "").toLowerCase().includes(q)
    );
  }, [data, search]);

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
      <PageHeader back={`/performance/${year}/${month}`} icon={ArrowUp} title="Revenue Details" description={<>{MONTH_NAMES[month]} {year} — {data.revenue.length} record{data.revenue.length !== 1 ? "s" : ""}</>} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total Revenue</p>
            <p className="text-2xl font-bold text-foreground">{formatCurrency(data.total)}</p>
          </CardContent>
        </Card>
        <Card className="">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Events with Revenue</p>
            <p className="text-2xl font-bold">{data.revenue.length}</p>
          </CardContent>
        </Card>
        <Card className="">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Outstanding</p>
            <p className="text-2xl font-bold text-warning">
              {formatCurrency(data.revenue.reduce((s, r) => s + (r.outstandingAmount ?? 0), 0))}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="py-4 border-b">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by event, client, invoice..."
                className="pl-9 bg-background"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              {search ? "No records match your search." : "No revenue records for this month."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Collected</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow key={r.eventId}>
                      <TableCell>
                        <Link href={`/events/${r.eventId}`} className="font-medium hover:underline">
                          {r.eventName}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{r.clientName ?? "—"}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(r.netRevenue)}</TableCell>
                      <TableCell className="text-right text-money-in">{formatCurrency(r.totalCollected)}</TableCell>
                      <TableCell className={cn("text-right", (r.outstandingAmount ?? 0) > 0 ? "text-warning" : "text-muted-foreground")}>
                        {formatCurrency(r.outstandingAmount ?? 0)}
                      </TableCell>
                      <TableCell>
                        <span className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                          (r.paymentStatus ?? "") === "paid" && "bg-success/10 text-money-in",
                          (r.paymentStatus ?? "") === "partial" && "bg-warning/10 text-warning",
                          (r.paymentStatus ?? "") === "overdue" && "bg-destructive/10 text-money-out",
                          (r.paymentStatus ?? "") === "pending" && "bg-muted text-muted-foreground",
                          !["paid", "partial", "overdue", "pending"].includes(r.paymentStatus ?? "") && "bg-muted text-muted-foreground",
                        )}>
                          {r.paymentStatus ?? "—"}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(r.eventDate ?? "")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
