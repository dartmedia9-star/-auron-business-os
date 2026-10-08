import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from "recharts";
import type { PerformanceAnnual } from "@workspace/api-client-react";
import { ChartCard } from "@/components/ds/chart-card";
import { formatAxisMoney, formatMoney } from "@/lib/money";
import { cn, formatPercentage } from "@/lib/utils";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type SeriesKey = "revenue" | "cashReceived" | "grossProfit" | "netProfit";

// Fixed colour per series (never re-assigned when others are hidden). Revenue
// is a bar, the rest are lines, so identity never rests on colour alone.
const SERIES: Array<{ key: SeriesKey; label: string; color: string; mark: "bar" | "line"; dashed?: boolean }> = [
  { key: "revenue", label: "Revenue", color: "var(--color-chart-1)", mark: "bar" },
  { key: "cashReceived", label: "Cash received", color: "var(--color-chart-3)", mark: "line" },
  { key: "grossProfit", label: "Gross profit", color: "var(--color-chart-4)", mark: "line", dashed: true },
  { key: "netProfit", label: "Net profit", color: "var(--color-chart-2)", mark: "line" },
];

type Row = Record<SeriesKey, number> & { name: string; month: number; events: number };

function ChartTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as Row | undefined;
  return (
    <div className="min-w-[200px] rounded-lg border bg-popover px-3 py-2.5 text-xs shadow-lift">
      <p className="mb-1.5 font-medium text-foreground">
        {label}
        {row && <span className="ml-1.5 font-normal text-muted-foreground">· {row.events} event{row.events === 1 ? "" : "s"}</span>}
      </p>
      <div className="space-y-1">
        {payload.map((p) => {
          const s = SERIES.find((x) => x.key === p.dataKey);
          return (
            <div key={String(p.dataKey)} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className={cn("inline-block", s?.mark === "bar" ? "h-2 w-2 rounded-[2px]" : "h-0.5 w-3 rounded-full")} style={{ background: s?.color }} />
                {s?.label}
              </span>
              <span className="font-medium tabular-nums text-foreground">{formatMoney(Number(p.value))}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/*
 * Main monthly chart for the selected year, straight from /performance/annual
 * (same P&L as Finance Summary; cash received from the fund ledger). The chart
 * stays mounted across year changes so bars and lines morph to the new data.
 */
export function PerformanceChart({
  data,
  year,
  loading,
  error,
  onRetry,
}: {
  data: PerformanceAnnual | undefined;
  year: number;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  const reduce = useReducedMotion();
  const [hidden, setHidden] = useState<Set<SeriesKey>>(() => new Set(["grossProfit"]));

  const rows = useMemo<Row[]>(
    () =>
      (data?.months ?? []).map((m) => ({
        name: MONTHS[m.month - 1],
        month: m.month,
        events: m.eventCount,
        revenue: m.revenue,
        cashReceived: m.cashReceived ?? 0,
        grossProfit: m.grossProfit,
        netProfit: m.netProfit,
      })),
    [data],
  );
  const empty = rows.length > 0 && rows.every((r) => r.revenue === 0 && r.cashReceived === 0 && r.netProfit === 0);
  const t = data?.totals;

  const toggle = (key: SeriesKey) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else if (SERIES.length - next.size > 1) next.add(key); // keep at least one
      return next;
    });

  const animate = !reduce;

  return (
    <ChartCard
      title="Performance"
      description={`${year} by month · revenue excl. GST by event date, cash by payment date`}
      loading={loading && !data}
      error={error && !data ? error : undefined}
      onRetry={onRetry}
      empty={empty}
      emptyTitle={`No activity in ${year}`}
      emptyDescription="Revenue appears here once events dated this year have revenue recorded."
      height="h-[240px] sm:h-[320px]"
      actions={
        <div role="group" aria-label="Series" className="-mx-1 flex max-w-full gap-1 overflow-x-auto px-1 pb-0.5">
          {SERIES.map((s) => {
            const on = !hidden.has(s.key);
            return (
              <button
                key={s.key}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(s.key)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-[color,background-color,border-color,opacity] duration-150",
                  on ? "border-border bg-card text-foreground shadow-xs" : "border-transparent bg-transparent text-muted-foreground opacity-70 hover:opacity-100",
                )}
              >
                <span
                  aria-hidden
                  className={cn("inline-block transition-opacity", s.mark === "bar" ? "h-2.5 w-2.5 rounded-[3px]" : "h-0.5 w-3.5 rounded-full", !on && "opacity-40")}
                  style={{ background: s.color }}
                />
                {s.label}
              </button>
            );
          })}
        </div>
      }
      footer={
        t && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <dl className="grid flex-1 grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            {[
              { label: "Direct costs", value: formatMoney(t.directCosts) },
              { label: "Operating expenses", value: formatMoney(t.operatingExpenses) },
              { label: "Gross margin", value: formatPercentage(t.grossMarginPct) },
              { label: "Events", value: String(t.eventCount) },
            ].map((s) => (
              <div key={s.label} className="min-w-0">
                <dt className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">{s.label}</dt>
                <dd className="mt-0.5 truncate text-sm font-medium tabular-nums">{s.value}</dd>
              </div>
            ))}
          </dl>
          <Link href={`/performance/${year}`} className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-gold-ink hover:underline">
            Full year breakdown <ArrowRight className="h-3 w-3" />
          </Link>
          </div>
        )
      }
    >
      <div className={cn("h-full w-full transition-opacity duration-200", loading && "opacity-60")}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="0" strokeOpacity={0.7} />
            <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={8} fontSize={11} stroke="var(--color-muted-foreground)" interval="preserveStartEnd" />
            <YAxis
              tickLine={false}
              axisLine={false}
              fontSize={11}
              width={52}
              stroke="var(--color-muted-foreground)"
              tickFormatter={(v: number) => formatAxisMoney(v)}
              className="max-sm:hidden"
            />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--color-muted)", opacity: 0.6 }} animationDuration={150} />
            {!hidden.has("revenue") && (
              <Bar
                dataKey="revenue"
                fill="var(--color-chart-1)"
                radius={[4, 4, 0, 0]}
                maxBarSize={28}
                isAnimationActive={animate}
                animationDuration={700}
                animationEasing="ease-out"
              />
            )}
            {SERIES.filter((s) => s.mark === "line" && !hidden.has(s.key)).map((s, i) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                stroke={s.color}
                strokeWidth={2}
                strokeDasharray={s.dashed ? "4 4" : undefined}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--color-card)" }}
                isAnimationActive={animate}
                animationBegin={200 + i * 80}
                animationDuration={900}
                animationEasing="ease-out"
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
