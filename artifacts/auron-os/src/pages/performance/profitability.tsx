import { useMemo, useState } from "react";
import { PageHeader } from "@/components/ds/page-header";
import { useGetPerformanceMonthlyProfitability } from "@workspace/api-client-react";
import { formatCurrency, formatPercentage, cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Minus, Search } from "lucide-react";
import { Link, useParams } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";

const MONTH_NAMES = [
  "", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function PerformanceProfitability() {
  const params = useParams<{ year: string; month: string }>();
  const year = parseInt(params.year ?? String(new Date().getFullYear()), 10);
  const month = parseInt(params.month ?? "1", 10);

  const { data, isLoading } = useGetPerformanceMonthlyProfitability({ year, month });
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("profit_desc");

  const filtered = useMemo(() => {
    if (!data?.events) return [];
    const q = search.trim().toLowerCase();

    let result = data.events.filter((e) => {
      if (q) {
        return (
          e.eventName?.toLowerCase().includes(q) ||
          e.clientName?.toLowerCase().includes(q) ||
          e.eventType?.toLowerCase().includes(q)
        );
      }
      return true;
    });

    result.sort((a, b) => {
      switch (sortBy) {
        case "profit_asc": return (a.profit ?? 0) - (b.profit ?? 0);
        case "revenue_desc": return (b.revenue ?? 0) - (a.revenue ?? 0);
        case "revenue_asc": return (a.revenue ?? 0) - (b.revenue ?? 0);
        case "cost_desc": return (b.directCost ?? 0) - (a.directCost ?? 0);
        case "date": return new Date(a.eventDate ?? 0).getTime() - new Date(b.eventDate ?? 0).getTime();
        default: return (b.profit ?? 0) - (a.profit ?? 0);
      }
    });

    return result;
  }, [data, search, sortBy]);

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
      <PageHeader back={`/performance/${year}/${month}`} icon={Minus} title="Event Profitability" description={<>{MONTH_NAMES[month]} {year} — {data.events.length} event{data.events.length !== 1 ? "s" : ""}</>} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total Revenue</p>
            <p className="text-2xl font-bold text-foreground">{formatCurrency(data.totalRevenue)}</p>
          </CardContent>
        </Card>
        <Card className="">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total Direct Costs</p>
            <p className="text-2xl font-bold text-money-out">{formatCurrency(data.totalCost)}</p>
          </CardContent>
        </Card>
        <Card className="">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total Gross Profit</p>
            <p className="text-2xl font-bold text-primary">{formatCurrency(data.totalProfit)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="py-4 border-b space-y-3">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search event name, client, type..."
                className="pl-9 bg-background"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-[160px] bg-background h-9 text-xs">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="profit_desc">Highest Profit</SelectItem>
                <SelectItem value="profit_asc">Lowest Profit</SelectItem>
                <SelectItem value="revenue_desc">Highest Revenue</SelectItem>
                <SelectItem value="revenue_asc">Lowest Revenue</SelectItem>
                <SelectItem value="cost_desc">Highest Cost</SelectItem>
                <SelectItem value="date">By Date</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              {search ? "No events match your search." : "No events for this month."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Direct Cost</TableHead>
                    <TableHead className="text-right">Profit</TableHead>
                    <TableHead className="text-right">Margin</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((e) => (
                    <TableRow key={e.eventId}>
                      <TableCell>
                        <Link href={`/events/${e.eventId}`} className="font-medium hover:underline">
                          {e.eventName}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{e.clientName ?? "—"}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-muted">
                          {e.eventType}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(e.revenue ?? 0)}</TableCell>
                      <TableCell className="text-right text-money-out">{(e.directCost ?? 0) > 0 ? formatCurrency(e.directCost ?? 0) : "—"}</TableCell>
                      <TableCell className={cn("text-right font-medium", (e.profit ?? 0) >= 0 ? "text-money-in" : "text-money-out")}>
                        {formatCurrency(e.profit ?? 0)}
                      </TableCell>
                      <TableCell className={cn("text-right", (e.marginPct ?? 0) >= 20 ? "text-money-in" : (e.marginPct ?? 0) >= 10 ? "text-warning" : "text-money-out")}>
                        {(e.revenue ?? 0) > 0 ? formatPercentage(e.marginPct ?? 0) : "—"}
                      </TableCell>
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
