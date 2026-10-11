import { Link } from "wouter";
import { ArrowRight, Target } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DashboardSummary, EventTypeStats } from "@workspace/api-client-react";
import { ChartCard } from "@/components/ds/chart-card";
import { SectionHeader } from "@/components/ds/section-header";
import { ErrorState, ListSkeleton } from "@/components/ds/states";
import { AnimatedNumber } from "@/components/ds/animated-number";
import { Button } from "@/components/ui/button";
import { formatAxisMoney, formatMoney } from "@/lib/money";
import { formatPercentage } from "@/lib/utils";
import { chartAxis, chartCursor, chartGrid, ChartTooltipCard, useChartAnimation } from "@/lib/chart-theme";

/* Lead pipeline figures from /dashboard/summary (unchanged calculations). */
export function PipelineCard({
  summary,
  loading,
  error,
  onRetry,
}: {
  summary: DashboardSummary | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  return (
    <section className="flex min-w-0 flex-col rounded-2xl border bg-card p-4 shadow-[var(--glass-highlight),var(--elev-1)] sm:p-5">
      <SectionHeader
        title="Pipeline"
        description="Open leads, weighted by probability"
        action={
          <Button variant="ghost" size="sm" asChild className="text-muted-foreground">
            <Link href="/leads">
              Leads <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </Button>
        }
      />
      {error && !summary ? (
        <ErrorState compact title="Couldn't load pipeline" error={error} onRetry={onRetry} />
      ) : loading || !summary ? (
        <ListSkeleton rows={3} className="mt-5" />
      ) : (
        <div className="mt-4 flex flex-1 flex-col">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/12 text-gold-ink">
              <Target className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Weighted pipeline</p>
              <AnimatedNumber value={summary.weightedPipeline} format={formatMoney} className="block text-xl font-semibold tracking-tight tabular-nums" />
            </div>
          </div>
          <dl className="mt-5 grid grid-cols-2 gap-4 border-t pt-4 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Total open value</dt>
              <dd className="mt-0.5 font-medium tabular-nums">{formatMoney(summary.pipelineValue)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Win rate</dt>
              <dd className="mt-0.5 font-medium tabular-nums">{formatPercentage(summary.winRate)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Avg. event value</dt>
              <dd className="mt-0.5 font-medium tabular-nums">{formatMoney(summary.avgEventValue)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Avg. profit per event</dt>
              <dd className="mt-0.5 font-medium tabular-nums">{formatMoney(summary.avgProfitPerEvent)}</dd>
            </div>
          </dl>
        </div>
      )}
    </section>
  );
}

/* Existing event-type breakdown, displayed as-is (categories untouched). */
export function EventTypeChart({
  data,
  year,
  loading,
  error,
  onRetry,
}: {
  data: EventTypeStats[] | undefined;
  year: number;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  const barAnimation = useChartAnimation();
  const rows = data ?? [];
  return (
    <ChartCard
      title="Revenue by event type"
      description={`Revenue (excl. GST) for events dated in ${year}`}
      loading={loading && !data}
      error={error && !data ? error : undefined}
      onRetry={onRetry}
      empty={rows.length === 0}
      emptyTitle={`No events in ${year}`}
      height="h-[240px]"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }} barCategoryGap="30%">
          <CartesianGrid horizontal={false} {...chartGrid} />
          <XAxis type="number" {...chartAxis} tickFormatter={(v: number) => formatAxisMoney(v)} />
          <YAxis dataKey="eventType" type="category" {...chartAxis} width={116} />
          <Tooltip
            cursor={chartCursor}
            content={({ active, payload }) => {
              const row = payload?.[0]?.payload as EventTypeStats | undefined;
              if (!active || !row) return null;
              return (
                <ChartTooltipCard>
                  <p className="font-medium">{row.eventType}</p>
                  <p className="mt-1 tabular-nums">{formatMoney(row.totalRevenue)}</p>
                  <p className="text-muted-foreground">
                    {row.eventCount} event{row.eventCount === 1 ? "" : "s"} · {formatPercentage(row.grossMarginPct)} margin
                  </p>
                </ChartTooltipCard>
              );
            }}
          />
          <Bar dataKey="totalRevenue" fill="var(--color-chart-1)" radius={[0, 4, 4, 0]} maxBarSize={18} {...barAnimation} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
