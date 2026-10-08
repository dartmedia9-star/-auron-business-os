import { useMemo, useState } from "react";
import { PageHeader } from "@/components/ds/page-header";
import { useGetPerformanceMonthlyExpenses } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowDown, Search } from "lucide-react";
import { Link, useParams } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";

const MONTH_NAMES = [
  "", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function PerformanceExpenses() {
  const params = useParams<{ year: string; month: string }>();
  const year = parseInt(params.year ?? String(new Date().getFullYear()), 10);
  const month = parseInt(params.month ?? "1", 10);

  const { data, isLoading } = useGetPerformanceMonthlyExpenses({ year, month });
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterPayer, setFilterPayer] = useState("all");
  const [sortBy, setSortBy] = useState("newest");

  const filtered = useMemo(() => {
    if (!data?.expenses) return [];
    const q = search.trim().toLowerCase();

    let result = data.expenses.filter((e) => {
      if (q) {
        const match =
          e.description?.toLowerCase().includes(q) ||
          e.category?.toLowerCase().includes(q) ||
          e.eventName?.toLowerCase().includes(q) ||
          e.paidBy?.toLowerCase().includes(q) ||
          e.referenceNumber?.toLowerCase().includes(q);
        if (!match) return false;
      }
      if (filterCategory !== "all" && e.category !== filterCategory) return false;
      if (filterPayer !== "all" && (e.paidBy || "Unspecified") !== filterPayer) return false;
      return true;
    });

    result.sort((a, b) => {
      switch (sortBy) {
        case "amount_desc": return b.amount - a.amount;
        case "amount_asc": return a.amount - b.amount;
        case "oldest": return new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime();
        default: return new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime();
      }
    });

    return result;
  }, [data, search, filterCategory, filterPayer, sortBy]);

  const categories = useMemo(() => {
    if (!data?.byCategory) return [];
    return data.byCategory.map((c) => c.category);
  }, [data]);

  const payers = useMemo(() => {
    if (!data?.byPayer) return [];
    return data.byPayer.map((p) => p.payer);
  }, [data]);

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
      <PageHeader back={`/performance/${year}/${month}`} icon={ArrowDown} title="Expense Details" description={<>{MONTH_NAMES[month]} {year} — {data.count} expense{data.count !== 1 ? "s" : ""}</>} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total Amount</p>
            <p className="text-2xl font-bold text-money-out">{formatCurrency(data.totalAmount)}</p>
          </CardContent>
        </Card>
        <Card className="">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total GST</p>
            <p className="text-2xl font-bold text-warning">{formatCurrency(data.totalGst)}</p>
          </CardContent>
        </Card>
        <Card className="">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total Cash Out</p>
            <p className="text-2xl font-bold text-money-out">{formatCurrency(data.totalCashOut)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="py-4 border-b space-y-3">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search description, category, event, paid by..."
                className="pl-9 bg-background"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="w-[130px] bg-background h-9 text-xs">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterPayer} onValueChange={setFilterPayer}>
                <SelectTrigger className="w-[140px] bg-background h-9 text-xs">
                  <SelectValue placeholder="Paid By" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Payers</SelectItem>
                  {payers.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-[120px] bg-background h-9 text-xs">
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest</SelectItem>
                  <SelectItem value="oldest">Oldest</SelectItem>
                  <SelectItem value="amount_desc">Highest</SelectItem>
                  <SelectItem value="amount_asc">Lowest</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              {search || filterCategory !== "all" || filterPayer !== "all"
                ? "No expenses match your filters."
                : "No expenses for this month."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Description</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">GST</TableHead>
                    <TableHead className="text-right">Cash Out</TableHead>
                    <TableHead>Paid By</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium max-w-[200px] truncate">{e.description}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-muted">
                          {e.category}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(e.amount)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{(e.gst ?? 0) > 0 ? formatCurrency(e.gst!) : "—"}</TableCell>
                      <TableCell className="text-right font-medium text-money-out">{formatCurrency(e.cashOut)}</TableCell>
                      <TableCell className="text-sm">{e.paidBy || "—"}</TableCell>
                      <TableCell className="text-sm">
                        {e.eventId ? (
                          <Link href={`/events/${e.eventId}`} className="hover:underline text-primary">
                            {e.eventName}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {e.date ? formatDate(e.date) : formatDate(e.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">By Category</CardTitle>
          </CardHeader>
          <CardContent>
            {data.byCategory.length === 0 ? (
              <p className="text-sm text-muted-foreground">No category data.</p>
            ) : (
              <div className="space-y-2">
                {data.byCategory.map((c) => (
                  <div key={c.category} className="flex items-center justify-between">
                    <span className="text-sm">{c.category}</span>
                    <div className="text-right">
                      <span className="text-sm font-medium">{formatCurrency(c.total)}</span>
                      <span className="text-xs text-muted-foreground ml-2">({c.count})</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">By Paid By</CardTitle>
          </CardHeader>
          <CardContent>
            {data.byPayer.length === 0 ? (
              <p className="text-sm text-muted-foreground">No payer data.</p>
            ) : (
              <div className="space-y-2">
                {data.byPayer.map((p) => (
                  <div key={p.payer} className="flex items-center justify-between">
                    <span className="text-sm">{p.payer}</span>
                    <div className="text-right">
                      <span className="text-sm font-medium">{formatCurrency(p.total)}</span>
                      <span className="text-xs text-muted-foreground ml-2">({p.count})</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
