import type { ComponentType, ReactNode } from "react";
import { Link } from "wouter";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { AnimatedNumber } from "./animated-number";
import { formatINR } from "./money";
import { Sparkline } from "./sparkline";

const TONES = {
  neutral: { icon: "bg-muted text-foreground", value: "text-foreground", spark: "text-slate" },
  primary: { icon: "bg-primary/12 text-gold-ink", value: "text-foreground", spark: "text-gold" },
  in: { icon: "bg-success/10 text-success", value: "text-money-in", spark: "text-success" },
  out: { icon: "bg-destructive/10 text-destructive", value: "text-money-out", spark: "text-destructive" },
  warning: { icon: "bg-warning/10 text-warning", value: "text-foreground", spark: "text-warning" },
  info: { icon: "bg-info/10 text-info", value: "text-foreground", spark: "text-info" },
  teal: { icon: "bg-teal/10 text-teal", value: "text-foreground", spark: "text-teal" },
} as const;

export type KpiTone = keyof typeof TONES;

/** A real comparison only (e.g. YoY from the API); never synthesised. */
export type KpiTrend = { value: number; label: string; positiveIsGood?: boolean };

/*
 * One headline figure. Interactive (lifts on hover) only when it links
 * somewhere. `loading` keeps the card's shape so the figure replaces the
 * placeholder in place instead of the layout jumping.
 */
export function KpiCard({
  label,
  value,
  format = (n) => formatINR(n),
  icon: Icon,
  tone = "neutral",
  hint,
  trend,
  spark,
  href,
  delay = 0,
  loading = false,
  className,
}: {
  label: string;
  value: number;
  format?: (n: number) => string;
  icon?: ComponentType<{ className?: string }>;
  tone?: KpiTone;
  hint?: ReactNode;
  trend?: KpiTrend | null;
  /** Monthly values for a small trend line under the figure. */
  spark?: number[];
  href?: string;
  /** Seconds to delay the count-up, to stagger a row of cards. */
  delay?: number;
  loading?: boolean;
  className?: string;
}) {
  const t = TONES[tone];
  const up = trend ? trend.value >= 0 : false;
  const good = trend ? (trend.positiveIsGood === false ? !up : up) : false;

  const body = (
    <div
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-xl border bg-card p-3.5 shadow-card transition-[box-shadow,transform,border-color] duration-200 ease-out sm:p-5",
        href && "hover:-translate-y-0.5 hover:border-foreground/12 hover:shadow-lift",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10px] font-medium uppercase leading-snug tracking-[0.08em] text-muted-foreground sm:text-[11px]">{label}</p>
        {Icon && (
          <span
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-transform sm:h-8 sm:w-8 duration-200 ease-out",
              href && "group-hover:scale-105",
              t.icon,
            )}
          >
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>
      {loading ? (
        <div aria-busy="true" aria-label={`Loading ${label}`}>
          <Skeleton className="mt-3 h-7 w-3/4" />
          <Skeleton className="mt-2.5 h-3 w-1/2" />
        </div>
      ) : (
        <>
          <AnimatedNumber
            value={value}
            format={format}
            delay={delay}
            className={cn("mt-2 block text-[clamp(15px,4.4vw,22px)] font-semibold leading-tight tracking-tight tabular-nums [overflow-wrap:anywhere] sm:text-2xl", t.value)}
          />
          {(trend || hint) && (
            <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              {trend && (
                <span
                  className={cn(
                    "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-medium tabular-nums",
                    good ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive",
                  )}
                >
                  {up ? <ArrowUpRight className="h-3 w-3" aria-hidden /> : <ArrowDownRight className="h-3 w-3" aria-hidden />}
                  {Math.abs(trend.value).toFixed(1)}%
                  <span className="sr-only">{up ? "up" : "down"}</span>
                </span>
              )}
              {trend && <span className="truncate">{trend.label}</span>}
              {!trend && hint && <span className="truncate">{hint}</span>}
            </div>
          )}
          {trend && hint && <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>}
          {spark && (
            <div className={cn("mt-auto pt-3", t.spark)}>
              <Sparkline values={spark} delay={delay + 0.15} />
            </div>
          )}
        </>
      )}
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {body}
    </Link>
  ) : (
    body
  );
}
