import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  useGetDashboardSummary, 
  useGetRevenueTrend, 
  useGetEventTypeBreakdown,
  getGetDashboardSummaryQueryKey,
  getGetRevenueTrendQueryKey,
  getGetEventTypeBreakdownQueryKey
} from "@workspace/api-client-react";
import { formatCurrency, formatCompactCurrency, formatPercentage } from "@/lib/utils";
import { TrendingUp, TrendingDown, ArrowUpRight, DollarSign, Wallet, Target, Activity } from "lucide-react";
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
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {trend != null && (
          <p className="text-xs text-muted-foreground mt-1 flex items-center">
            <span className={trend >= 0 ? "text-emerald-500 flex items-center mr-1" : "text-red-500 flex items-center mr-1"}>
              {trend >= 0 ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
              {Math.abs(trend).toFixed(1)}%
            </span>
            {trendLabel || "from last month"}
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

  if (isLoadingSummary || !summary) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 bg-muted animate-pulse rounded" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">CEO Command Center</h2>
        <p className="text-muted-foreground mt-1">Real-time performance metrics and operating data.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Revenue & Profit Trend</CardTitle>
          </CardHeader>
          <CardContent className="pl-0">
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis 
                    dataKey="name" 
                    stroke="var(--color-muted-foreground)" 
                    fontSize={12} 
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis 
                    stroke="var(--color-muted-foreground)" 
                    fontSize={12} 
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `₹${value / 100000}L`}
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

        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Event Type Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={typeData || []} layout="vertical" margin={{ top: 0, right: 0, left: 40, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
                  <XAxis type="number" hide />
                  <YAxis 
                    dataKey="eventType" 
                    type="category" 
                    axisLine={false} 
                    tickLine={false} 
                    fontSize={12}
                    stroke="var(--color-muted-foreground)"
                  />
                  <RechartsTooltip 
                    cursor={{fill: 'var(--color-muted)', opacity: 0.4}}
                    contentStyle={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}
                    formatter={(value: number) => [formatCurrency(value), 'Revenue']}
                  />
                  <Bar dataKey="totalRevenue" fill="var(--color-primary)" radius={[0, 4, 4, 0]} barSize={24} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
         <Card>
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
        
        <Card className="col-span-2">
           <CardHeader>
             <CardTitle>Executive Insights</CardTitle>
           </CardHeader>
           <CardContent>
             <div className="space-y-4">
               {/* Replace with Insights hook when wired up, using placeholder for now */}
               <div className="flex gap-3 p-3 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-500">
                  <ArrowUpRight className="h-5 w-5 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-sm">Receivables Alert</h4>
                    <p className="text-sm opacity-90 mt-1">₹4.2L is overdue by more than 30 days. Recommend immediate follow-up with Client A and Client B.</p>
                  </div>
               </div>
               <div className="flex gap-3 p-3 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-500">
                  <TrendingUp className="h-5 w-5 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-sm">Margin Improvement</h4>
                    <p className="text-sm opacity-90 mt-1">Corporate event margins increased by 4.2% this quarter due to better vendor negotiations.</p>
                  </div>
               </div>
             </div>
           </CardContent>
        </Card>
      </div>
    </div>
  );
}
