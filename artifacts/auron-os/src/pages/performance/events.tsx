import { useMemo, useState } from "react";
import { PageHeader } from "@/components/ds/page-header";
import { StatusBadge } from "@/components/ds/status-badge";
import { useGetPerformanceMonthlyEvents } from "@workspace/api-client-react";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, Search } from "lucide-react";
import { Link, useParams } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";

const MONTH_NAMES = [
  "", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function PerformanceEvents() {
  const params = useParams<{ year: string; month: string }>();
  const year = parseInt(params.year ?? String(new Date().getFullYear()), 10);
  const month = parseInt(params.month ?? "1", 10);

  const { data, isLoading } = useGetPerformanceMonthlyEvents({ year, month });
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  const eventTypes = useMemo(() => {
    if (!data?.events) return [];
    const types = new Set(data.events.map((e) => e.eventType));
    return Array.from(types);
  }, [data]);

  const filtered = useMemo(() => {
    if (!data?.events) return [];
    const q = search.trim().toLowerCase();

    return data.events.filter((e) => {
      if (q) {
        if (
          !e.name?.toLowerCase().includes(q) &&
          !e.clientName?.toLowerCase().includes(q) &&
          !e.eventType?.toLowerCase().includes(q) &&
          !e.venue?.toLowerCase().includes(q)
        ) return false;
      }
      if (filterType !== "all" && e.eventType !== filterType) return false;
      if (filterStatus !== "all" && e.status !== filterStatus) return false;
      return true;
    });
  }, [data, search, filterType, filterStatus]);

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
      <PageHeader back={`/performance/${year}/${month}`} icon={Calendar} title="Events" description={<>{MONTH_NAMES[month]} {year} — {data.count} event{data.count !== 1 ? "s" : ""}</>} />

      <Card>
        <CardContent className="py-4 border-b space-y-3">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search event, client, type, venue..."
                className="pl-9 bg-background"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-[130px] bg-background h-9 text-xs">
                  <SelectValue placeholder="Event Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {eventTypes.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[130px] bg-background h-9 text-xs">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="upcoming">Upcoming</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              {search || filterType !== "all" || filterStatus !== "all"
                ? "No events match your filters."
                : "No events for this month."}
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
                    <TableHead className="text-right">Cost</TableHead>
                    <TableHead className="text-right">Profit</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell>
                        <Link href={`/events/${e.id}`} className="font-medium hover:underline">
                          {e.name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{e.clientName ?? "—"}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-muted">
                          {e.eventType}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-medium">{e.revenue ? formatCurrency(e.revenue) : "—"}</TableCell>
                      <TableCell className="text-right text-money-out">{e.directCost ? formatCurrency(e.directCost) : "—"}</TableCell>
                      <TableCell className={cn("text-right font-medium", (e.profit ?? 0) >= 0 ? "text-money-in" : "text-money-out")}>
                        {e.revenue || e.directCost ? formatCurrency(e.profit ?? 0) : "—"}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={e.status ?? ""} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(e.eventDate)}</TableCell>
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
