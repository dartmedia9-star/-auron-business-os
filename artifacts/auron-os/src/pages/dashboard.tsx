import { useState } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  useGetDashboardSummary, 
  useGetRevenueTrend, 
  useGetEventTypeBreakdown,
  useGetDashboardInsights,
  getGetDashboardSummaryQueryKey,
  getGetRevenueTrendQueryKey,
  getGetEventTypeBreakdownQueryKey,
  getGetDashboardInsightsQueryKey
} from "@workspace/api-client-react";
import { formatCurrency, formatCompactCurrency, formatPercentage } from "@/lib/utils";
import { TrendingUp, TrendingDown, ArrowUpRight, DollarSign, Wallet, Target, Activity, Plus } from "lucide-react";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  ResponsiveContainer,
  BarChart,
  Bar
} from "recharts";

function MetricCard({ 
  title, 
  value, 
  trend, 
  icon: Icon, 
  trendLabel 
}: { 
  title: string, 
  value: string, 
  trend?: number | null, 
  icon: any, 
  trendLabel?: string 
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground truncate">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      </CardHeader>
      <CardContent>
        <div className="text-xl sm:text-2xl font-bold truncate">{value}</div>
        {trend != null && (
          <p className="text-[10px] sm:text-xs text-muted-foreground mt-1 flex flex-wrap items-center">
            <span className={trend >= 0 ? "text-emerald-500 flex items-center mr-1" : "text-red-500 flex items-center mr-1"}>
              {trend >= 0 ? <TrendingUp className="h-3 w-3 mr-1 shrink-0" /> : <TrendingDown className="h-3 w-3 mr-1 shrink-0" />}
              {Math.abs(trend).toFixed(1)}%
            </span>
            <span className="truncate">{trendLabel || "from last month"}</span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { data: summary, isLoading: isLoadingSummary } = useGetDashboardSummary(undefined, {
    query: { queryKey: getGetDashboardSummaryQueryKey() }
  });
  
  const { data: trendData } = useGetRevenueTrend(undefined, {
    query: { queryKey: getGetRevenueTrendQueryKey() }
  });

  const { data: typeData } = useGetEventTypeBreakdown(undefined, {
    query: { queryKey: getGetEventTypeBreakdownQueryKey() }
  });

  const { data: insights } = useGetDashboardInsights({
    query: { queryKey: getGetDashboardInsightsQueryKey() }
  });

  if (isLoadingSummary || !summary) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 bg-muted animate-pulse rounded" />
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          {[1,2,3,4].map(i => (
            <Card key={i} className="h-32 bg-muted/50 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const chartData = trendData?.map(d => ({
    name: `${d.month}/${d.year.toString().slice(2)}`,
    Revenue: d.revenue,
    Profit: d.grossProfit
  })) || [];

  return (
    <div className="space-y-8 max-w-full overflow-hidden">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">CEO Command Center</h2>
          <p className="text-muted-foreground mt-1">Real-time performance metrics and operating data.</p>
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <Button variant="outline" size="sm" asChild className="flex-1 sm:flex-none">
            <Link href="/events"><Plus className="mr-1 h-4 w-4" /> Event</Link>
          </Button>
          <Button variant="outline" size="sm" asChild className="flex-1 sm:flex-none">
            <Link href="/clients"><Plus className="mr-1 h-4 w-4" /> Client</Link>
          </Button>
          <Button variant="outline" size="sm" asChild className="flex-1 sm:flex-none">
            <Link href="/leads"><Plus className="mr-1 h-4 w-4" /> Lead</Link>
          </Button>
          <Button variant="outline" size="sm" asChild className="flex-1 sm:flex-none">
            <Link href="/finance/expenses"><Plus className="mr-1 h-4 w-4" /> Expense</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <MetricCard 
          title="Total Revenue" 
          value={formatCompactCurrency(summary.revenue)} 
          trend={summary.revenueGrowthPct} 
          icon={DollarSign} 
        />
        <MetricCard 
          title="Gross Profit" 
          value={formatCompactCurrency(summary.grossProfit)} 
          trend={null} 
          icon={Wallet} 
          trendLabel={`${formatPercentage(summary.grossMarginPct)} margin`}
        />
        <MetricCard 
          title="EBITDA" 
          value={formatCompactCurrency(summary.ebitda)} 
          trend={null} 
          icon={Activity} 
          trendLabel={`${formatPercentage(summary.ebitdaMarginPct)} margin`}
        />
        <MetricCard 
          title="Weighted Pipeline" 
          value={formatCompactCurrency(summary.weightedPipeline)} 
          trend={null} 
          icon={Target} 
          trendLabel={`from ${formatCompactCurrency(summary.pipelineValue)} total`}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7 min-w-0">
        <Card className="lg:col-span-4 min-w-0 overflow-hidden">
          <CardHeader>
            <CardTitle>Revenue & Profit Trend</CardTitle>
          </CardHeader>
          <CardContent className="pl-0 pb-0 sm:pb-6">
            <div className="h-[250px] sm:h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis 
                    dataKey="name" 
                    stroke="var(--color-muted-foreground)" 
                    fontSize={10} 
                    tickLine={false}
                    axisLine={false}
                    tickMargin={10}
                  />
                  <YAxis 
                    stroke="var(--color-muted-foreground)" 
                    fontSize={10} 
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `₹${value / 100000}L`}
                    width={40}
                  />
                  <RechartsTooltip 
                    contentStyle={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}
                    formatter={(value: number) => [formatCurrency(value), undefined]}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="Revenue" 
                    stroke="var(--color-primary)" 
                    strokeWidth={2}
                    dot={{ r: 4, fill: 'var(--color-primary)' }}
                    activeDot={{ r: 6 }} 
                  />
                  <Line 
                    type="monotone" 
                    dataKey="Profit" 
                    stroke="var(--color-chart-2)" 
                    strokeWidth={2}
                    dot={{ r: 4, fill: 'var(--color-chart-2)' }} 
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3 min-w-0 overflow-hidden">
          <CardHeader>
            <CardTitle>Event Type Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px] sm:h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={typeData || []} layout="vertical" margin={{ top: 0, right: 0, left: 20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
                  <XAxis type="number" hide />
                  <YAxis 
                    dataKey="eventType" 
                    type="category" 
                    axisLine={false} 
                    tickLine={false} 
                    fontSize={10}
                    stroke="var(--color-muted-foreground)"
                    width={60}
                  />
                  <RechartsTooltip 
                    cursor={{fill: 'var(--color-muted)', opacity: 0.4}}
                    contentStyle={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}
                    formatter={(value: number) => [formatCurrency(value), 'Revenue']}
                  />
                  <Bar dataKey="totalRevenue" fill="var(--color-primary)" radius={[0, 4, 4, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 min-w-0">
         <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Operations Quick View</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Upcoming Events</span>
                <span className="font-medium">{summary.events.upcoming}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">In Progress Events</span>
                <span className="font-medium">{summary.events.inProgress}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Avg. Profit per Event</span>
                <span className="font-medium text-emerald-500">{formatCurrency(summary.avgProfitPerEvent)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Outstanding Receivables</span>
                <span className="font-medium text-amber-500">{formatCurrency(summary.outstandingReceivables)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="md:col-span-2 min-w-0">
           <CardHeader>
             <CardTitle>Executive Insights</CardTitle>
           </CardHeader>
           <CardContent>
             <div className="space-y-4">
               {insights?.map((insight, idx) => (
                 <div key={idx} className={`flex gap-3 p-3 rounded-md border ${
                   insight.type === 'alert' ? 'bg-red-500/10 border-red-500/20 text-red-500' :
                   insight.type === 'warning' ? 'bg-amber-500/10 border-amber-500/20 text-amber-500' :
                   insight.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' :
                   'bg-blue-500/10 border-blue-500/20 text-blue-500'
                 }`}>
                    {insight.type === 'alert' || insight.type === 'warning' ? (
                      <ArrowUpRight className="h-5 w-5 shrink-0 mt-0.5" />
                    ) : (
                      <TrendingUp className="h-5 w-5 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <p className="text-sm font-medium">{insight.message}</p>
                    </div>
                 </div>
               ))}
               {(!insights || insights.length === 0) && (
                 <div className="text-sm text-muted-foreground py-4 text-center">
                   No critical insights at this time.
                 </div>
               )}
             </div>
           </CardContent>
        </Card>
      </div>
    </div>
  );
}
