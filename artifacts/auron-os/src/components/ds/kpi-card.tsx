import type { ComponentType, ReactNode } from "react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { AnimatedNumber } from "./animated-number";
import { formatINR } from "./money";

const TONES = {
  neutral: { icon: "bg-muted text-foreground", value: "text-foreground" },
  primary: { icon: "bg-primary/12 text-primary", value: "text-foreground" },
  in: { icon: "bg-success/10 text-success", value: "text-money-in" },
  out: { icon: "bg-destructive/10 text-destructive", value: "text-money-out" },
  warning: { icon: "bg-warning/10 text-warning", value: "text-foreground" },
  info: { icon: "bg-info/10 text-info", value: "text-foreground" },
} as const;

export type KpiTone = keyof typeof TONES;

/* One headline figure. Interactive (lifts on hover) only when it links somewhere. */
export function KpiCard({
  label,
  value,
  format = (n) => formatINR(n),
  icon: Icon,
  tone = "neutral",
  hint,
  href,
  className,
}: {
  label: string;
  value: number;
  format?: (n: number) => string;
  icon?: ComponentType<{ className?: string }>;
  tone?: KpiTone;
  hint?: ReactNode;
  href?: string;
  className?: string;
}) {
  const t = TONES[tone];
  const body = (
    <div
      className={cn(
        "group h-full rounded-xl border bg-card p-4 shadow-card transition-[box-shadow,transform,border-color] duration-200 sm:p-5",
        href && "hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lift",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        {Icon && (
          <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", t.icon)}>
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>
      <AnimatedNumber value={value} format={format} className={cn("mt-2 block text-xl [overflow-wrap:anywhere] font-semibold tabular-nums tracking-tight sm:text-2xl", t.value)} />
      {hint && <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
  return href ? (
    <Link href={href} className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {body}
    </Link>
  ) : (
    body
  );
}
