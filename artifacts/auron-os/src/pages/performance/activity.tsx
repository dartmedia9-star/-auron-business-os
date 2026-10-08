import { useMemo, useState } from "react";
import { PageHeader } from "@/components/ds/page-header";
import { useGetPerformanceMonthlyActivity } from "@workspace/api-client-react";
import { formatDate, cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { History, Search } from "lucide-react";
import { useParams } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";

const MONTH_NAMES = [
  "", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function PerformanceActivity() {
  const params = useParams<{ year: string; month: string }>();
  const year = parseInt(params.year ?? String(new Date().getFullYear()), 10);
  const month = parseInt(params.month ?? "1", 10);

  const { data, isLoading } = useGetPerformanceMonthlyActivity({ year, month });
  const [search, setSearch] = useState("");
  const [filterModule, setFilterModule] = useState("all");
  const [filterAction, setFilterAction] = useState("all");

  const modules = useMemo(() => {
    if (!data?.logs) return [];
    const types = new Set(data.logs.map((l) => l.entityType));
    return Array.from(types).sort();
  }, [data]);

  const actions = useMemo(() => {
    if (!data?.logs) return [];
    const acts = new Set(data.logs.map((l) => l.action));
    return Array.from(acts).sort();
  }, [data]);

  const filtered = useMemo(() => {
    if (!data?.logs) return [];
    const q = search.trim().toLowerCase();

    return data.logs.filter((l) => {
      if (q) {
        const desc = `${l.action} ${l.entityType} #${l.entityId}`;
        const newVals = l.newValues ? JSON.stringify(l.newValues).toLowerCase() : "";
        if (!desc.toLowerCase().includes(q) && !newVals.includes(q) && !l.userId?.toLowerCase().includes(q)) {
          return false;
        }
      }
      if (filterModule !== "all" && l.entityType !== filterModule) return false;
      if (filterAction !== "all" && l.action !== filterAction) return false;
      return true;
    });
  }, [data, search, filterModule, filterAction]);

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
      <PageHeader back={`/performance/${year}/${month}`} icon={History} title="Activity Logs" description={<>{MONTH_NAMES[month]} {year} — {data.count} log entry{data.count !== 1 ? "s" : ""}</>} />

      <Card>
        <CardHeader className="py-4 border-b space-y-3">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search action, entity, user..."
                className="pl-9 bg-background"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={filterModule} onValueChange={setFilterModule}>
                <SelectTrigger className="w-[130px] bg-background h-9 text-xs">
                  <SelectValue placeholder="Module" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Modules</SelectItem>
                  {modules.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterAction} onValueChange={setFilterAction}>
                <SelectTrigger className="w-[120px] bg-background h-9 text-xs">
                  <SelectValue placeholder="Action" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  {actions.map((a) => (
                    <SelectItem key={a} value={a}>{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              {search || filterModule !== "all" || filterAction !== "all"
                ? "No logs match your filters."
                : "No activity logs for this month."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Module</TableHead>
                    <TableHead>Entity ID</TableHead>
                    <TableHead>Description</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((l) => {
                    const desc = l.newValues
                      ? (() => {
                          try {
                            const nv = typeof l.newValues === "string" ? JSON.parse(l.newValues) : l.newValues;
                            return nv.name || nv.description || nv.content || JSON.stringify(nv).slice(0, 100);
                          } catch {
                            return "—";
                          }
                        })()
                      : "—";

                    return (
                      <TableRow key={l.id}>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {formatDate(String(l.createdAt))}
                        </TableCell>
                        <TableCell className="text-sm">{l.userEmail || l.userId}</TableCell>
                        <TableCell>
                          <span className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                            l.action === "create" && "bg-success/10 text-money-in",
                            l.action === "update" && "bg-warning/10 text-warning",
                            l.action === "delete" && "bg-destructive/10 text-money-out",
                            !["create", "update", "delete"].includes(l.action) && "bg-muted text-muted-foreground",
                          )}>
                            {l.action}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm">{l.entityType}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">#{l.entityId}</TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[250px] truncate">
                          {desc}
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
