import { useMemo } from "react";
import { useGetPerformanceAnnual } from "@workspace/api-client-react";
import { formatCurrency, formatPercentage, cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ArrowLeft, BarChart3, ChevronRight } from "lucide-react";
import { Link, useParams } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from "recharts";

const MONTH_NAMES = [
  "", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const MONTH_SHORT = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function PerformanceAnnual() {
  const params = useParams<{ year: string }>();
  const year = parseInt(params.year ?? String(new Date().getFullYear()), 10);

  const { data, isLoading } = useGetPerformanceAnnual({ year });

  const chartData = useMemo(() => {
    if (!data?.months) return [];
    return data.months.map((m) => ({
      name: MONTH_SHORT[m.month],
      Revenue: m.revenue,
      Expenses: m.operatingExpenses + m.directCosts,
      Profit: m.netProfit,
    }));
  }, [data]);

  if (isLoading || !data) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-96 rounded-lg" />
      </div>
    );
  }

  const hasAnyData = data.totals.revenue > 0 || data.totals.eventCount > 0;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-4">
        <Link href="/performance">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl flex items-center gap-3">
            <BarChart3 className="h-8 w-8 text-primary" />
            {year}
          </h2>
          <p className="text-muted-foreground mt-1">Annual financial performance overview.</p>
        </div>
      </div>

      {hasAnyData && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Revenue vs Expenses vs Profit</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(v: number) => `₹${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Legend />
                  <Bar dataKey="Revenue" fill="#3b82f6" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="Expenses" fill="#f97316" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="Profit" fill="#10b981" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Monthly Summary</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px]">Month</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Direct Costs</TableHead>
                  <TableHead className="text-right">Gross Profit</TableHead>
                  <TableHead className="text-right">Op. Expenses</TableHead>
                  <TableHead className="text-right">Net Profit</TableHead>
                  <TableHead className="text-center">Events</TableHead>
                  <TableHead className="w-[40px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.months.map((m) => {
                  const hasData = m.revenue > 0 || m.eventCount > 0;
                  return (
                    <TableRow
                      key={m.month}
                      className={cn(
                        "cursor-pointer hover:bg-muted/50 transition-colors",
                        !hasData && "opacity-60",
                      )}
                    >
                      <TableCell className="font-medium">
                        <Link href={`/performance/${year}/${m.month}`} className="block">
                          {MONTH_NAMES[m.month]}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right text-blue-500">
                        <Link href={`/performance/${year}/${m.month}`} className="block">
                          {hasData ? formatCurrency(m.revenue) : "—"}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right text-money-out">
                        <Link href={`/performance/${year}/${m.month}`} className="block">
                          {hasData && m.directCosts > 0 ? `-${formatCurrency(m.directCosts)}` : "—"}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        <Link href={`/performance/${year}/${m.month}`} className="block">
                          {hasData ? formatCurrency(m.grossProfit) : "—"}
                          {m.grossMarginPct > 0 && (
                            <span className="text-xs text-muted-foreground ml-1">
                              ({formatPercentage(m.grossMarginPct)})
                            </span>
                          )}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right text-orange-500">
                        <Link href={`/performance/${year}/${m.month}`} className="block">
                          {hasData && m.operatingExpenses > 0 ? `-${formatCurrency(m.operatingExpenses)}` : "—"}
                        </Link>
                      </TableCell>
                      <TableCell className={cn("text-right font-medium", m.netProfit >= 0 ? "text-money-in" : "text-money-out")}>
                        <Link href={`/performance/${year}/${m.month}`} className="block">
                          {hasData ? formatCurrency(m.netProfit) : "—"}
                        </Link>
                      </TableCell>
                      <TableCell className="text-center">
                        <Link href={`/performance/${year}/${m.month}`} className="block">
                          {m.eventCount > 0 ? m.eventCount : "—"}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link href={`/performance/${year}/${m.month}`} className="block">
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {/* Year totals row */}
                <TableRow className="bg-muted/50 font-bold border-t-2">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right text-blue-500">{formatCurrency(data.totals.revenue)}</TableCell>
                  <TableCell className="text-right text-money-out">{data.totals.directCosts > 0 ? `-${formatCurrency(data.totals.directCosts)}` : "—"}</TableCell>
                  <TableCell className="text-right">{formatCurrency(data.totals.grossProfit)}</TableCell>
                  <TableCell className="text-right text-orange-500">{data.totals.operatingExpenses > 0 ? `-${formatCurrency(data.totals.operatingExpenses)}` : "—"}</TableCell>
                  <TableCell className={cn("text-right", data.totals.netProfit >= 0 ? "text-money-in" : "text-money-out")}>
                    {formatCurrency(data.totals.netProfit)}
                  </TableCell>
                  <TableCell className="text-center">{data.totals.eventCount}</TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
