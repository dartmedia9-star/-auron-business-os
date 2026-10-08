import { useGetPerformanceMonthly } from "@workspace/api-client-react";
import { formatCurrency, formatPercentage, cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Landmark, ArrowUp, ArrowDown, Minus, TrendingUp } from "lucide-react";
import { Link, useParams } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";

const MONTH_NAMES = [
  "", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function PerformanceNetProfit() {
  const params = useParams<{ year: string; month: string }>();
  const year = parseInt(params.year ?? String(new Date().getFullYear()), 10);
  const month = parseInt(params.month ?? "1", 10);

  const { data, isLoading } = useGetPerformanceMonthly({ year, month });

  if (isLoading || !data) {
    return (
      <div className="space-y-6 max-w-3xl mx-auto">
        <Skeleton className="h-12 w-80" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-4">
        <Link href={`/performance/${year}/${month}`}>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h2 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Landmark className="h-7 w-7 text-emerald-500" />
            Net Profit
          </h2>
          <p className="text-muted-foreground mt-1">{MONTH_NAMES[month]} {year} — Final bottom line</p>
        </div>
      </div>

      <Card className={cn("border-l-4 shadow-md", data.netProfit >= 0 ? "border-l-emerald-500" : "border-l-red-500")}>
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground mb-1">Net Profit</p>
          <p className={cn("text-3xl font-bold", data.netProfit >= 0 ? "text-emerald-500" : "text-red-500")}>
            {formatCurrency(data.netProfit)}
          </p>
          <p className="text-sm text-muted-foreground mt-1">Net Margin: {formatPercentage(data.netMarginPct)}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">How Net Profit is Calculated</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between py-3 border-b">
            <div className="flex items-center gap-3">
              <ArrowUp className="h-5 w-5 text-blue-500" />
              <div>
                <p className="font-medium">Revenue</p>
                <p className="text-xs text-muted-foreground">Net revenue from all events</p>
              </div>
            </div>
            <p className="font-bold text-blue-500">{formatCurrency(data.revenue)}</p>
          </div>

          <div className="flex items-center justify-between py-3 border-b">
            <div className="flex items-center gap-3">
              <ArrowDown className="h-5 w-5 text-red-500" />
              <div>
                <p className="font-medium">Direct Costs (COGS)</p>
                <p className="text-xs text-muted-foreground">Event vendor costs + linked expenses</p>
              </div>
            </div>
            <p className="font-bold text-red-500">-{formatCurrency(data.directCosts)}</p>
          </div>

          <div className="flex items-center justify-between py-3 border-b">
            <div className="flex items-center gap-3">
              <Minus className="h-5 w-5 text-primary" />
              <div>
                <p className="font-medium">Gross Profit</p>
              </div>
            </div>
            <p className={cn("font-bold", data.grossProfit >= 0 ? "text-primary" : "text-red-500")}>
              {formatCurrency(data.grossProfit)}
            </p>
          </div>

          <div className="flex items-center justify-between py-3 border-b">
            <div className="flex items-center gap-3">
              <ArrowDown className="h-5 w-5 text-orange-500" />
              <div>
                <p className="font-medium">Operating Expenses</p>
                <p className="text-xs text-muted-foreground">Rent, payroll, marketing, admin</p>
              </div>
            </div>
            <p className="font-bold text-orange-500">-{formatCurrency(data.operatingExpenses)}</p>
          </div>

          <div className="flex items-center justify-between py-3 border-b">
            <div className="flex items-center gap-3">
              <TrendingUp className="h-5 w-5 text-emerald-500" />
              <div>
                <p className="font-medium">EBITDA</p>
              </div>
            </div>
            <p className={cn("font-bold", data.ebitda >= 0 ? "text-emerald-500" : "text-red-500")}>
              {formatCurrency(data.ebitda)}
            </p>
          </div>

          <div className="flex items-center justify-between py-3 bg-muted/50 rounded-lg px-3">
            <div className="flex items-center gap-3">
              <Landmark className="h-5 w-5 text-emerald-500" />
              <div>
                <p className="font-bold text-lg">Net Profit</p>
                <p className="text-xs text-muted-foreground">Final bottom line for the month</p>
              </div>
            </div>
            <div className="text-right">
              <p className={cn("text-2xl font-bold", data.netProfit >= 0 ? "text-emerald-500" : "text-red-500")}>
                {formatCurrency(data.netProfit)}
              </p>
              <p className="text-xs text-muted-foreground">Margin: {formatPercentage(data.netMarginPct)}</p>
            </div>
          </div>

          <p className="text-xs text-muted-foreground pt-2">
            In the current Auron Business OS, Net Profit equals EBITDA because no interest, tax, depreciation, or amortisation adjustments are tracked. This is consistent with the existing Finance Summary.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
