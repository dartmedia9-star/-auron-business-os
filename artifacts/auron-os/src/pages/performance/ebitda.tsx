import { useGetPerformanceMonthly } from "@workspace/api-client-react";
import { formatCurrency, formatPercentage, cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, TrendingUp, ArrowUp, ArrowDown, Minus } from "lucide-react";
import { Link, useParams } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";

const MONTH_NAMES = [
  "", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function PerformanceEbitda() {
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
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl flex items-center gap-3">
            <TrendingUp className="h-7 w-7 text-money-in" />
            EBITDA
          </h2>
          <p className="text-muted-foreground mt-1">{MONTH_NAMES[month]} {year} — Earnings Before Interest, Tax, Depreciation & Amortisation</p>
        </div>
      </div>

      <Card className="border-l-4 border-l-emerald-500 shadow-md">
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground mb-1">EBITDA</p>
          <p className="text-3xl font-bold text-money-in">{formatCurrency(data.ebitda)}</p>
          <p className="text-sm text-muted-foreground mt-1">Margin: {formatPercentage(data.ebitdaMarginPct)}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">How EBITDA is Calculated</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between py-3 border-b">
            <div className="flex items-center gap-3">
              <ArrowUp className="h-5 w-5 text-blue-500" />
              <div>
                <p className="font-medium">Revenue</p>
                <p className="text-xs text-muted-foreground">Net revenue from all events this month</p>
              </div>
            </div>
            <p className="font-bold text-blue-500">{formatCurrency(data.revenue)}</p>
          </div>

          <div className="flex items-center justify-between py-3 border-b">
            <div className="flex items-center gap-3">
              <ArrowDown className="h-5 w-5 text-money-out" />
              <div>
                <p className="font-medium">Direct Costs (COGS)</p>
                <p className="text-xs text-muted-foreground">Event costs + linked operating expenses</p>
              </div>
            </div>
            <p className="font-bold text-money-out">-{formatCurrency(data.directCosts)}</p>
          </div>

          <div className="flex items-center justify-between py-3 border-b">
            <div className="flex items-center gap-3">
              <Minus className="h-5 w-5 text-primary" />
              <div>
                <p className="font-medium">Gross Profit</p>
                <p className="text-xs text-muted-foreground">Revenue minus direct costs</p>
              </div>
            </div>
            <p className={cn("font-bold", data.grossProfit >= 0 ? "text-primary" : "text-money-out")}>
              {formatCurrency(data.grossProfit)}
            </p>
          </div>

          <div className="flex items-center justify-between py-3 border-b">
            <div className="flex items-center gap-3">
              <ArrowDown className="h-5 w-5 text-orange-500" />
              <div>
                <p className="font-medium">Operating Expenses</p>
                <p className="text-xs text-muted-foreground">Rent, payroll, marketing, admin (non-event)</p>
              </div>
            </div>
            <p className="font-bold text-orange-500">-{formatCurrency(data.operatingExpenses)}</p>
          </div>

          <div className="flex items-center justify-between py-3 bg-muted/50 rounded-lg px-3">
            <div className="flex items-center gap-3">
              <TrendingUp className="h-5 w-5 text-money-in" />
              <div>
                <p className="font-bold text-lg">EBITDA</p>
                <p className="text-xs text-muted-foreground">Gross Profit minus Operating Expenses</p>
              </div>
            </div>
            <div className="text-right">
              <p className={cn("text-2xl font-bold", data.ebitda >= 0 ? "text-money-in" : "text-money-out")}>
                {formatCurrency(data.ebitda)}
              </p>
              <p className="text-xs text-muted-foreground">Margin: {formatPercentage(data.ebitdaMarginPct)}</p>
            </div>
          </div>

          <p className="text-xs text-muted-foreground pt-2">
            Note: In the Auron Business OS, EBITDA equals Net Profit because no depreciation, interest, or tax adjustments are currently tracked. This matches the existing Finance Summary definitions.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
