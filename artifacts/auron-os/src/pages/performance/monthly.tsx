import { useGetPerformanceMonthly } from "@workspace/api-client-react";
import { PageHeader } from "@/components/ds/page-header";
import { formatCurrency, formatPercentage, cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

import { ArrowUp, ArrowDown, Minus, TrendingUp, Calendar, Wallet, Landmark, Target, BarChart3 } from "lucide-react";
import { Link, useParams } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";

const MONTH_NAMES = [
  "", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function KpiCard({
  title, subtitle, value, icon: Icon, color, href, negative,
}: {
  title: string; subtitle: string; value: string; icon: any;
  color: string; href: string; negative?: boolean;
}) {
  const colorMap: Record<string, { bg: string; icon: string; text: string; border: string }> = {
    blue: { bg: "bg-muted", icon: "text-foreground", text: "text-foreground", border: "border-l-blue-500" },
    red: { bg: "bg-destructive/10", icon: "text-money-out", text: "text-money-out", border: "border-l-red-500" },
    gold: { bg: "bg-primary/12", icon: "text-gold-ink", text: "text-gold-ink", border: "border-l-primary" },
    orange: { bg: "bg-warning/10", icon: "text-warning", text: "text-warning", border: "border-l-orange-500" },
    emerald: { bg: "bg-success/10", icon: "text-money-in", text: "text-money-in", border: "border-l-emerald-500" },
    violet: { bg: "bg-muted", icon: "text-slate", text: "text-slate", border: "border-l-violet-500" },
    teal: { bg: "bg-teal/10", icon: "text-teal", text: "text-teal", border: "border-l-teal-500" },
    slate: { bg: "bg-muted", icon: "text-muted-foreground", text: "text-foreground", border: "border-l-muted-foreground" },
  };
  const c = colorMap[color] ?? colorMap.blue;

  return (
    <Link href={href} className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <Card className="cursor-pointer transition-[box-shadow,transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-foreground/12 hover:shadow-lift">
        <CardContent className="flex items-center justify-between p-4 sm:p-6">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center shrink-0", c.bg)}>
              <Icon className={cn("h-5 w-5", c.icon)} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-muted-foreground truncate">{title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
            </div>
          </div>
          <div className={cn("text-lg sm:text-2xl font-semibold tracking-tight tabular-nums shrink-0 ml-4", negative ? c.text : "")}>
            {value}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function PerformanceMonthly() {
  const params = useParams<{ year: string; month: string }>();
  const year = parseInt(params.year ?? String(new Date().getFullYear()), 10);
  const month = parseInt(params.month ?? String(new Date().getMonth() + 1), 10);

  const { data, isLoading } = useGetPerformanceMonthly({ year, month });

  if (isLoading || !data) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <Skeleton className="h-12 w-80" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const hasAnyData = data.revenue > 0 || data.eventCount > 0;
  const monthName = MONTH_NAMES[month] ?? "";
  const lastDay = new Date(year, month, 0).getDate();

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <PageHeader back={`/performance/${year}`} title={`${monthName} ${year}`} description={`${monthName} 1 – ${monthName} ${lastDay}, ${year}`} />

      {!hasAnyData ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-lg font-medium">No financial activity for {monthName} {year}</p>
            <p className="text-sm text-muted-foreground mt-1">
              No events, expenses, or revenue records found for this month.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <KpiCard
              title="Total Revenue"
              subtitle="Net revenue from events"
              value={formatCurrency(data.revenue)}
              icon={ArrowUp}
              color="blue"
              href={`/performance/${year}/${month}/revenue`}
            />
            <KpiCard
              title="Total Expenses"
              subtitle="Direct costs + operating expenses"
              value={formatCurrency(data.directCosts + data.operatingExpenses)}
              icon={ArrowDown}
              color="red"
              href={`/performance/${year}/${month}/expenses`}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <KpiCard
              title="Gross Profit"
              subtitle={`Margin: ${formatPercentage(data.grossMarginPct)}`}
              value={formatCurrency(data.grossProfit)}
              icon={Minus}
              color="gold"
              href={`/performance/${year}/${month}/profitability`}
            />
            <KpiCard
              title="Operating Expenses"
              subtitle="Rent, payroll, marketing, admin"
              value={formatCurrency(data.operatingExpenses)}
              icon={ArrowDown}
              color="orange"
              href={`/performance/${year}/${month}/expenses`}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <KpiCard
              title="EBITDA"
              subtitle={`Margin: ${formatPercentage(data.ebitdaMarginPct)}`}
              value={formatCurrency(data.ebitda)}
              icon={TrendingUp}
              color="emerald"
              href={`/performance/${year}/${month}/ebitda`}
            />
            <KpiCard
              title="Net Profit"
              subtitle={`Margin: ${formatPercentage(data.netMarginPct)}`}
              value={formatCurrency(data.netProfit)}
              icon={Landmark}
              color={data.netProfit >= 0 ? "emerald" : "red"}
              href={`/performance/${year}/${month}/net-profit`}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <KpiCard
              title="Events"
              subtitle={`${data.eventCount} event${data.eventCount !== 1 ? "s" : ""} this month`}
              value={String(data.eventCount)}
              icon={Calendar}
              color="violet"
              href={`/performance/${year}/${month}/events`}
            />
            <KpiCard
              title="Cash Movement"
              subtitle="Fund account activity"
              value={`${data.fundAccounts?.length ?? 0} accounts`}
              icon={Wallet}
              color="teal"
              href={`/performance/${year}/${month}/cashflow`}
            />
          </div>

          <div className="grid grid-cols-1 gap-3">
            <KpiCard
              title="Activity Logs"
              subtitle="Audit trail for this month"
              value=""
              icon={BarChart3}
              color="slate"
              href={`/performance/${year}/${month}/activity`}
            />
          </div>
        </div>
      )}
    </div>
  );
}
