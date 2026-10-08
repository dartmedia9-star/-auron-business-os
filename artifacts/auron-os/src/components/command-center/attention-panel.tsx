import type { ComponentType } from "react";
import { Link } from "wouter";
import { motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, CalendarClock, ChevronRight, CircleCheck, HandCoins, PhoneCall, TrendingDown, Wallet } from "lucide-react";
import { differenceInCalendarDays, parseISO } from "date-fns";
import type { Event, Insight, ReceivablesSummary } from "@workspace/api-client-react";
import { SectionHeader } from "@/components/ds/section-header";
import { ErrorState, ListSkeleton } from "@/components/ds/states";
import { fadeUp, staggerContainer } from "@/lib/motion";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

type Severity = "high" | "medium" | "low";

type Item = {
  id: string;
  severity: Severity;
  icon: ComponentType<{ className?: string }>;
  title: string;
  detail: string;
  amount?: number;
  href: string;
};

const SEVERITY: Record<Severity, { icon: string; label: string; dot: string }> = {
  high: { icon: "bg-destructive/10 text-destructive", label: "High", dot: "bg-destructive" },
  medium: { icon: "bg-warning/10 text-warning", label: "Medium", dot: "bg-warning" },
  low: { icon: "bg-info/10 text-info", label: "Info", dot: "bg-info" },
};
const RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

/*
 * Deterministic attention list built only from data the app already
 * computes: receivables aging and client balances (/finance/receivables),
 * upcoming events' profitability (/events) and the existing dashboard
 * insights for lead follow-ups. No scoring, no AI, nothing invented.
 */
export function buildAttentionItems({
  receivables,
  upcoming,
  insights,
}: {
  receivables: ReceivablesSummary | undefined;
  upcoming: Event[];
  insights: Insight[] | undefined;
}): Item[] {
  const items: Item[] = [];
  const today = new Date();

  if (receivables) {
    if (receivables.overdue > 0) {
      const overdueEvents = receivables.byEvent.filter((e) => e.dueDate && parseISO(e.dueDate) < today && e.outstanding > 0).length;
      items.push({
        id: "overdue",
        severity: receivables.overdue60 > 0 ? "high" : "medium",
        icon: AlertTriangle,
        title: "Overdue on events",
        // Aging is per event; client-level payments not yet allocated to an
        // event are not deducted here (the API reports them separately).
        detail: [
          `${overdueEvents} event${overdueEvents === 1 ? "" : "s"} past due`,
          receivables.overdue60 > 0 ? `${formatMoney(receivables.overdue60)} over 60 days` : null,
          (receivables.unallocatedPaymentsApplied ?? 0) > 0 ? `before ${formatMoney(receivables.unallocatedPaymentsApplied ?? 0)} unallocated payments` : null,
        ]
          .filter(Boolean)
          .join(" · "),
        amount: receivables.overdue,
        href: "/finance/receivables",
      });
    }
    const owing = receivables.byClient.filter((c) => c.outstanding > 0).slice(0, 3);
    for (const c of owing) {
      items.push({
        id: `client-${c.clientId}`,
        severity: "medium",
        icon: HandCoins,
        title: c.clientName,
        detail: (c.totalReceived ?? 0) > 0 ? `Partially paid · ${formatMoney(c.totalReceived ?? 0)} received so far` : "Nothing received yet",
        amount: c.outstanding,
        href: `/clients/${c.clientId}`,
      });
    }
    const credit = receivables.byClient.filter((c) => (c.credit ?? 0) > 0);
    if (credit.length > 0) {
      const total = credit.reduce((s, c) => s + (c.credit ?? 0), 0);
      items.push({
        id: "credit",
        severity: "low",
        icon: Wallet,
        title: credit.length === 1 ? `Client credit: ${credit[0].clientName}` : `Client credit on ${credit.length} accounts`,
        detail: "Paid more than invoiced; available to apply",
        amount: total,
        href: credit.length === 1 ? `/clients/${credit[0].clientId}` : "/finance/receivables",
      });
    }
  }

  for (const e of upcoming) {
    if (e.status !== "upcoming" && e.status !== "in_progress") continue;
    const days = differenceInCalendarDays(parseISO(e.eventDate), today);
    if ((e.totalRevenue ?? 0) === 0 && days >= 0 && days <= 30) {
      items.push({
        id: `norev-${e.id}`,
        severity: "medium",
        icon: CalendarClock,
        title: e.name,
        detail: `${days === 0 ? "Today" : `In ${days} day${days === 1 ? "" : "s"}`} · no revenue recorded yet`,
        href: `/events/${e.id}`,
      });
    } else if (e.profitabilityIndicator === "loss" || e.profitabilityIndicator === "warning") {
      items.push({
        id: `margin-${e.id}`,
        severity: e.profitabilityIndicator === "loss" ? "high" : "medium",
        icon: TrendingDown,
        title: e.name,
        detail: e.profitabilityIndicator === "loss" ? `Projected loss · ${(e.grossMarginPct ?? 0).toFixed(1)}% margin` : `Low margin · ${(e.grossMarginPct ?? 0).toFixed(1)}%`,
        amount: e.grossProfit,
        href: `/events/${e.id}`,
      });
    }
  }

  // Existing insights: only the actionable lead follow-ups (receivables are
  // already covered above from the same ledger).
  for (const i of insights ?? []) {
    if (i.id === "followups") {
      items.push({ id: "followups", severity: "medium", icon: PhoneCall, title: "Lead follow-ups overdue", detail: i.message, href: "/leads" });
    }
  }

  return items.sort((a, b) => RANK[a.severity] - RANK[b.severity] || (b.amount ?? 0) - (a.amount ?? 0));
}

export function AttentionPanel({
  items,
  loading,
  error,
  onRetry,
  limit = 6,
}: {
  items: Item[];
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  limit?: number;
}) {
  const reduce = useReducedMotion();
  const shown = items.slice(0, limit);
  const high = items.filter((i) => i.severity === "high").length;

  return (
    <section className="flex min-w-0 flex-col rounded-xl border bg-card shadow-card">
      <SectionHeader
        className="px-4 pt-4 sm:px-5 sm:pt-5"
        title={
          <span className="flex items-center gap-2">
            Needs attention
            {!loading && items.length > 0 && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[11px] font-medium tabular-nums",
                  high > 0 ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground",
                )}
              >
                {items.length}
              </span>
            )}
          </span>
        }
        description="From receivables, events and leads"
      />
      <div className="mt-2 flex-1 px-2 pb-2">
        {error ? (
          <ErrorState compact title="Couldn't check for issues" error={error} onRetry={onRetry} />
        ) : loading ? (
          <ListSkeleton rows={4} className="px-2 py-3" />
        ) : shown.length === 0 ? (
          <div className="flex animate-fade-up flex-col items-center gap-2 px-4 py-10 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-success/10 text-success">
              <CircleCheck className="h-5 w-5" />
            </span>
            <p className="font-medium">All clear</p>
            <p className="max-w-[240px] text-sm text-muted-foreground">No overdue payments, low-margin events or missed follow-ups.</p>
          </div>
        ) : (
          <motion.ul initial="hidden" animate="show" variants={staggerContainer(0.04, 0.15)} className="space-y-0.5">
            {shown.map((item) => {
              const sev = SEVERITY[item.severity];
              const Icon = item.icon;
              return (
                <motion.li key={item.id} variants={fadeUp(reduce, 6)}>
                  <Link
                    href={item.href}
                    className="group flex min-h-[52px] items-center gap-3 rounded-lg px-3 py-2.5 transition-colors duration-150 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className={cn("relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", sev.icon)}>
                      <Icon className="h-4 w-4" />
                      <span className="sr-only">{sev.label} priority</span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-sm font-medium">{item.title}</p>
                        {item.amount != null && (
                          <span className={cn("shrink-0 text-sm font-medium tabular-nums", item.amount < 0 && "text-money-out")}>{formatMoney(item.amount)}</span>
                        )}
                      </div>
                      <p className="line-clamp-2 text-xs text-muted-foreground">{item.detail}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-foreground" />
                  </Link>
                </motion.li>
              );
            })}
          </motion.ul>
        )}
        {!loading && !error && items.length > limit && (
          <p className="px-3 pb-2 pt-1 text-xs text-muted-foreground">
            +{items.length - limit} more in{" "}
            <Link href="/finance/receivables" className="font-medium text-gold-ink hover:underline">
              Receivables
            </Link>
          </p>
        )}
      </div>
    </section>
  );
}
