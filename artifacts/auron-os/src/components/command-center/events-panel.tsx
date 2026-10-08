import { Link, useLocation } from "wouter";
import { ArrowRight, CalendarDays, ChevronRight } from "lucide-react";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import type { Event } from "@workspace/api-client-react";
import { SectionHeader } from "@/components/ds/section-header";
import { StatusBadge } from "@/components/ds/status-badge";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/ds/states";
import { Stagger, StaggerItem } from "@/components/ds/reveal";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

function relativeDay(date: string): string {
  const d = differenceInCalendarDays(parseISO(date), new Date());
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  if (d === -1) return "Yesterday";
  return d > 0 ? `In ${d} days` : `${-d} days ago`;
}

/* Collected share of the invoice, from the event's own figures. */
function CollectedBar({ received, outstanding }: { received: number; outstanding: number }) {
  const total = received + outstanding;
  const pct = total > 0 ? Math.min(100, (received / total) * 100) : 0;
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
      <div className="h-full rounded-full bg-teal transition-[width] duration-700 ease-out" style={{ width: `${pct}%` }} />
    </div>
  );
}

function Margin({ pct, hasRevenue }: { pct: number; hasRevenue: boolean }) {
  if (!hasRevenue) return <span className="text-muted-foreground">—</span>;
  return <span className={cn("tabular-nums", pct < 0 ? "text-money-out" : "text-foreground")}>{pct.toFixed(1)}%</span>;
}

/*
 * Active and upcoming events with the money the event list already returns
 * (revenue excl. GST, collected, outstanding incl. GST, direct cost, gross).
 * A table on wide screens, cards on phones. Rows open the event page.
 */
export function EventsPanel({
  events,
  loading,
  error,
  onRetry,
}: {
  events: Event[];
  loading: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  const [, navigate] = useLocation();
  return (
    <section className="flex min-w-0 flex-col rounded-xl border bg-card shadow-card">
      <SectionHeader
        className="px-4 pt-4 sm:px-5 sm:pt-5"
        title="Active & upcoming events"
        description="In progress now and next on the calendar"
        action={
          <Button variant="ghost" size="sm" asChild className="text-muted-foreground">
            <Link href="/events">
              All events <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </Button>
        }
      />
      <div className="mt-3 min-w-0 flex-1">
        {error ? (
          <ErrorState compact title="Couldn't load events" error={error} onRetry={onRetry} />
        ) : loading ? (
          <ListSkeleton rows={4} className="px-4 pb-5 sm:px-5" />
        ) : events.length === 0 ? (
          <EmptyState
            compact
            icon={CalendarDays}
            title="No active or upcoming events"
            description="New events you create will show here until they're completed."
            action={
              <Button variant="outline" size="sm" asChild>
                <Link href="/events">Go to Events</Link>
              </Button>
            }
          />
        ) : (
          <>
            {/* Wide screens: table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y bg-surface-2/70 text-left text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                    <th className="px-5 py-2 font-medium">Event</th>
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 text-right font-medium">Revenue</th>
                    <th className="px-3 py-2 font-medium">Collected</th>
                    <th className="px-3 py-2 text-right font-medium">Outstanding</th>
                    <th className="px-5 py-2 text-right font-medium">Gross margin</th>
                  </tr>
                </thead>
                <Stagger as="tbody" className="divide-y divide-border/70" stagger={0.035} delay={0.05}>
                  {events.map((e) => {
                    const revenue = e.totalRevenue ?? 0;
                    const received = e.totalCollected ?? 0;
                    const outstanding = e.totalOutstanding ?? 0;
                    return (
                      <StaggerItem as="tr" key={e.id} onClick={() => navigate(`/events/${e.id}`)} className="group cursor-pointer transition-colors duration-150 hover:bg-surface-2">
                        <td className="max-w-[240px] px-5 py-3">
                          <Link href={`/events/${e.id}`} className="block truncate font-medium group-hover:text-gold-ink">
                            {e.name}
                          </Link>
                          <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="truncate">{e.clientName ?? "—"}</span>
                            {e.status === "in_progress" && <StatusBadge status={e.status} className="py-0" />}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3">
                          <div>{format(parseISO(e.eventDate), "d MMM")}</div>
                          <div className="text-xs text-muted-foreground">{relativeDay(e.eventDate)}</div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{formatMoney(revenue)}</td>
                        <td className="min-w-[110px] px-3 py-3">
                          <div className="mb-1.5 text-xs tabular-nums text-muted-foreground">{formatMoney(received)}</div>
                          <CollectedBar received={received} outstanding={outstanding} />
                        </td>
                        <td className={cn("whitespace-nowrap px-3 py-3 text-right tabular-nums", outstanding > 0 && "text-warning")}>{formatMoney(outstanding)}</td>
                        <td className="whitespace-nowrap px-5 py-3 text-right">
                          <Margin pct={e.grossMarginPct ?? 0} hasRevenue={revenue > 0} />
                          <div className={cn("text-xs tabular-nums text-muted-foreground", (e.grossProfit ?? 0) < 0 && "text-money-out")}>{formatMoney(e.grossProfit ?? 0)}</div>
                        </td>
                      </StaggerItem>
                    );
                  })}
                </Stagger>
              </table>
            </div>

            {/* Phones: cards */}
            <Stagger as="ul" className="space-y-2 px-3 pb-3 md:hidden" stagger={0.04}>
              {events.map((e) => {
                const revenue = e.totalRevenue ?? 0;
                const received = e.totalCollected ?? 0;
                const outstanding = e.totalOutstanding ?? 0;
                return (
                  <StaggerItem as="li" key={e.id}>
                    <Link
                      href={`/events/${e.id}`}
                      className="block rounded-lg border bg-card p-3.5 transition-[background-color,transform] duration-150 active:scale-[0.99] active:bg-surface-2"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{e.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {e.clientName ?? "—"} · {format(parseISO(e.eventDate), "d MMM")} · {relativeDay(e.eventDate)}
                          </p>
                        </div>
                        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <p className="text-muted-foreground">Revenue</p>
                          <p className="mt-0.5 font-medium tabular-nums">{formatMoney(revenue)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Outstanding</p>
                          <p className={cn("mt-0.5 font-medium tabular-nums", outstanding > 0 && "text-warning")}>{formatMoney(outstanding)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-muted-foreground">Margin</p>
                          <p className="mt-0.5 font-medium">
                            <Margin pct={e.grossMarginPct ?? 0} hasRevenue={revenue > 0} />
                          </p>
                        </div>
                      </div>
                      <div className="mt-3">
                        <CollectedBar received={received} outstanding={outstanding} />
                      </div>
                    </Link>
                  </StaggerItem>
                );
              })}
            </Stagger>
          </>
        )}
      </div>
    </section>
  );
}
