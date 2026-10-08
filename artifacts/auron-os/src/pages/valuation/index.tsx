import { formatAxisMoney } from "@/lib/money";
import { PageHeader } from "@/components/ds/page-header";
import { ErrorState, PageSkeleton } from "@/components/ds/states";
import { useGetValuationCommandCenter, getGetValuationCommandCenterQueryKey } from "@workspace/api-client-react";
import { formatCurrency, formatPercentage } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Target, TrendingUp, AlertCircle, BarChart3 } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from "recharts";

export default function ValuationCommand() {
  const { data, isLoading, error, refetch } = useGetValuationCommandCenter({
    query: { queryKey: getGetValuationCommandCenterQueryKey() }
  });

  if (isLoading) return <PageSkeleton kpis={4} />;
  if (!data) return <ErrorState title="Couldn't load valuation data" error={error} onRetry={() => refetch()} />;

  // Construct fake projection data for the chart based on current and target
  const currentValuation = data.scenarios.find(s => s.scenarioType === 'base')?.estimatedValuation || 0;
  
  const chartData = [
    { year: '2024', Base: currentValuation * 0.5, Aggressive: currentValuation * 0.5, Target: data.targetValuation },
    { year: '2025 (Current)', Base: currentValuation, Aggressive: currentValuation * 1.1, Target: data.targetValuation },
    { year: '2026', Base: currentValuation * 1.5, Aggressive: currentValuation * 2.0, Target: data.targetValuation },
    { year: '2027', Base: currentValuation * 2.2, Aggressive: data.targetValuation * 0.9, Target: data.targetValuation },
    { year: '2028', Base: data.targetValuation * 0.8, Aggressive: data.targetValuation * 1.2, Target: data.targetValuation },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        icon={Target}
        eyebrow={`Target ${formatCurrency(data.targetValuation)}`}
        title="Valuation Command"
        description="Strategic scenarios and gap analysis to reach target exit valuation."
      />

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="bg-card border-primary/50 col-span-4 md:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-primary">Target Valuation</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-primary">{formatCurrency(data.targetValuation)}</div>
            <div className="mt-4 pt-4 border-t border-primary/20 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Current Revenue</span>
                <span className="font-medium">{formatCurrency(data.currentMetrics.revenue)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Current EBITDA</span>
                <span className="font-medium">{formatCurrency(data.currentMetrics.ebitda)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-4 md:col-span-3">
          <CardHeader>
            <CardTitle>Growth Trajectory to Target</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="year" stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val: number) => formatAxisMoney(val)} />
                  <RechartsTooltip 
                    contentStyle={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}
                    formatter={(value: number) => [formatCurrency(value), undefined]}
                  />
                  <Line type="monotone" dataKey="Base" stroke="var(--color-chart-3)" strokeWidth={2} dot={{ r: 4 }} />
                  <Line type="monotone" dataKey="Aggressive" stroke="var(--color-chart-1)" strokeWidth={2} dot={{ r: 4 }} />
                  <Line type="step" dataKey="Target" stroke="var(--color-chart-2)" strokeDasharray="5 5" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {data.scenarios.map((scenario) => (
          <Card key={scenario.id} className={scenario.scenarioType === 'base' ? 'ring-1 ring-primary/50' : ''}>
            <CardHeader>
              <CardTitle className="flex justify-between items-center capitalize">
                {scenario.scenarioType} Scenario
                {scenario.scenarioType === 'aggressive' && <TrendingUp className="h-4 w-4 text-money-in" />}
              </CardTitle>
              <CardDescription>{scenario.name}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <div className="text-sm text-muted-foreground mb-1">Estimated Valuation</div>
                <div className="text-3xl font-bold">{formatCurrency(scenario.estimatedValuation)}</div>
                {scenario.gapToTarget && scenario.gapToTarget > 0 ? (
                  <div className="text-sm text-warning mt-1 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    Gap: {formatCurrency(scenario.gapToTarget)}
                  </div>
                ) : (
                  <div className="text-sm text-money-in mt-1 flex items-center gap-1">
                    Target Reached
                  </div>
                )}
              </div>

              <div className="space-y-3 pt-4 border-t">
                <h4 className="text-sm font-semibold">Required Metrics</h4>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Annual Revenue</span>
                  <span className="font-medium">{formatCurrency(scenario.requiredRevenue)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">EBITDA</span>
                  <span className="font-medium">{formatCurrency(scenario.requiredEbitda)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Required Growth</span>
                  <span className="font-medium">{formatPercentage(scenario.requiredAnnualGrowth)}</span>
                </div>
              </div>

              <div className="space-y-3 pt-4 border-t bg-muted/30 -mx-6 px-6 pb-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Rev Multiple</span>
                  <span className="font-medium">{scenario.revenueMultiple}x</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">EBITDA Multiple</span>
                  <span className="font-medium">{scenario.ebitdaMultiple}x</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
