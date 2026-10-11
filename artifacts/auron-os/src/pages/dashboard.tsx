import { useMemo, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { keepPreviousData } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowDownLeft, Banknote, CalendarPlus, ChevronDown, Landmark, LineChart, Plus, Receipt, Scale, Target, UserPlus, Wallet } from "lucide-react";
import { format } from "date-fns";
import {
  useGetDashboardInsights,
  useGetDashboardSummary,
  useGetEventTypeBreakdown,
  useGetFinanceSummary,
  useGetPerformanceAnnual,
  useGetPerformanceYears,
  useGetReceivablesSummary,
  useListAuditLogs,
  useListClients,
  useListEvents,
  useListFundAccounts,
  getGetDashboardInsightsQueryKey,
  getGetDashboardSummaryQueryKey,
  getGetEventTypeBreakdownQueryKey,
  getGetFinanceSummaryQueryKey,
  getGetPerformanceAnnualQueryKey,
  getGetPerformanceYearsQueryKey,
  getGetReceivablesSummaryQueryKey,
  getListAuditLogsQueryKey,
  getListClientsQueryKey,
  getListEventsQueryKey,
  getListFundAccountsQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@workspace/replit-auth-web";
import { KpiCard } from "@/components/ds/kpi-card";
import { Reveal } from "@/components/ds/reveal";
import { PerformanceChart } from "@/components/command-center/performance-chart";
import { EventsPanel } from "@/components/command-center/events-panel";
import { AttentionPanel, buildAttentionItems } from "@/components/command-center/attention-panel";
import { ActivityFeed } from "@/components/command-center/activity-feed";
import { EventTypeChart, PipelineCard } from "@/components/command-center/secondary";
import { LiveStatus, useLiveQueryOptions } from "@/components/command-center/live-status";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fadeUp, useReduceMotion } from "@/lib/motion";
import { sumMoney } from "@/lib/money";
import { localToday } from "@/lib/finance-queries";
import { cn, formatPercentage } from "@/lib/utils";

const QUICK_ADD = [
  { href: "/events", label: "Event", icon: CalendarPlus },
  { href: "/clients", label: "Client", icon: UserPlus },
  { href: "/leads", label: "Lead", icon: Target },
  { href: "/finance/expenses", label: "Expense", icon: Receipt },
];

function greeting(now: Date): string {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function SectionEyebrow({ id, className, children }: { id?: string; className?: string; children: ReactNode }) {
  return (
    <h2 id={id} className={cn("flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground", className)}>
      {children}
      <span aria-hidden className="h-px flex-1 bg-gradient-to-r from-border to-transparent" />
    </h2>
  );
}

/*
 * Command Center. Every figure comes from an existing endpoint and its
 * existing calculation (Performance annual, Finance summary, Receivables,
 * Events, audit log); nothing is computed here beyond picking and summing
 * fund balances for display. Each section loads and fails on its own.
 */
export default function Dashboard() {
  const reduce = useReduceMotion();
  const { user } = useAuth();
  const now = useMemo(() => new Date(), []);
  const currentYear = now.getFullYear();
  const [year, setYear] = useState(currentYear);
  const today = localToday();
  const live = useLiveQueryOptions();

  const years = useGetPerformanceYears({ query: { queryKey: getGetPerformanceYearsQueryKey(), ...live } });
  const annual = useGetPerformanceAnnual({ year }, { query: { queryKey: getGetPerformanceAnnualQueryKey({ year }), placeholderData: keepPreviousData, ...live } });
  const summary = useGetDashboardSummary(
    { period: "year", year },
    { query: { queryKey: getGetDashboardSummaryQueryKey({ period: "year", year }), placeholderData: keepPreviousData, ...live } },
  );
  const finance = useGetFinanceSummary(undefined, { query: { queryKey: getGetFinanceSummaryQueryKey(), ...live } });
  const receivables = useGetReceivablesSummary({ query: { queryKey: getGetReceivablesSummaryQueryKey(), ...live } });
  const insights = useGetDashboardInsights({ query: { queryKey: getGetDashboardInsightsQueryKey(), ...live } });
  const inProgressParams = { status: "in_progress", limit: 10 };
  const upcomingParams = { status: "upcoming", fromDate: today, limit: 50 };
  const inProgress = useListEvents(inProgressParams, { query: { queryKey: getListEventsQueryKey(inProgressParams), ...live } });
  const upcoming = useListEvents(upcomingParams, { query: { queryKey: getListEventsQueryKey(upcomingParams), ...live } });
  const auditParams = { limit: 7 };
  const audit = useListAuditLogs(auditParams, { query: { queryKey: getListAuditLogsQueryKey(auditParams), ...live } });
  const funds = useListFundAccounts({ query: { queryKey: getListFundAccountsQueryKey(), ...live } });
  const eventTypes = useGetEventTypeBreakdown(
    { year },
    { query: { queryKey: getGetEventTypeBreakdownQueryKey({ year }), placeholderData: keepPreviousData, ...live } },
  );

  const t = annual.data?.totals;
  const months = annual.data?.months ?? [];
  const cashPosition = finance.data?.fundAccounts ? sumMoney(...finance.data.fundAccounts.map((a) => a.balance)) : 0;
  const fundCount = finance.data?.fundAccounts?.length ?? 0;
  const yoy = summary.data && !summary.isPlaceholderData ? summary.data.revenueGrowthPct : null;

  const activeEvents = useMemo(() => {
    const seen = new Set<number>();
    const list = [...(inProgress.data?.data ?? []), ...(upcoming.data?.data ?? [])].filter((e) => {
      if (seen.has(e.id) || e.status === "cancelled") return false;
      seen.add(e.id);
      return true;
    });
    // In progress first, then soonest upcoming.
    return list
      .sort((a, b) => (a.status === "in_progress" ? 0 : 1) - (b.status === "in_progress" ? 0 : 1) || a.eventDate.localeCompare(b.eventDate))
      .slice(0, 6);
  }, [inProgress.data, upcoming.data]);

  const attention = useMemo(
    () => buildAttentionItems({ receivables: receivables.data, upcoming: activeEvents, insights: insights.data }),
    [receivables.data, activeEvents, insights.data],
  );

  // Names for the activity feed from data already on the page; the client
  // list is only fetched when a payment's client isn't known yet.
  const logs = audit.data?.data ?? [];
  const knownClients = useMemo(() => {
    const m = new Map<number, string>();
    for (const c of receivables.data?.byClient ?? []) m.set(c.clientId, c.clientName);
    for (const e of [...(inProgress.data?.data ?? []), ...(upcoming.data?.data ?? [])]) if (e.clientName) m.set(e.clientId, e.clientName);
    return m;
  }, [receivables.data, inProgress.data, upcoming.data]);
  const missingClient = logs.some((l) => {
    const id = Number((l.newValues ?? l.oldValues ?? {})["clientId"]);
    return l.entityType === "client_payment" && Number.isFinite(id) && !knownClients.has(id);
  });
  const clients = useListClients(undefined, { query: { queryKey: getListClientsQueryKey(), enabled: missingClient } });
  const clientNames = useMemo(() => {
    const m = new Map(knownClients);
    for (const c of clients.data?.data ?? []) m.set(c.id, c.name);
    return m;
  }, [knownClients, clients.data]);
  const fundNames = useMemo(() => new Map((funds.data ?? []).map((f) => [f.id, f.name])), [funds.data]);

  const yearOptions = years.data?.years?.length ? years.data.years : [currentYear];
  const firstName = user?.firstName || user?.username || null;
  const monthSpark = (key: "revenue" | "cashReceived" | "grossProfit" | "netProfit") => months.map((m) => m[key] ?? 0);
  const annualLoading = annual.isLoading;
  // A failed background refresh keeps the last data on screen (the live
  // status says so); a panel shows its error only when it has nothing to show.
  const liveQueries = [annual, summary, finance, receivables, insights, inProgress, upcoming, audit, funds, eventTypes];

  return (
    <div className="mx-auto max-w-[1440px] space-y-4 sm:space-y-5">
      {/* Header */}
      <motion.header initial="hidden" animate="show" variants={fadeUp(reduce, 6)} className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-gold-ink">
            Command Center · {format(now, "EEEE, d MMMM yyyy")}
          </p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight sm:text-[32px] sm:leading-tight">
            {greeting(now)}
            {firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Here's how Auron Events is doing in {year}.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LiveStatus queries={liveQueries} className="max-w-full" />
          <div className="flex items-center gap-2">
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="h-9 w-[100px] rounded-full bg-card" aria-label="Year">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-9 rounded-full bg-card">
                  <Plus className="mr-1.5 h-4 w-4" /> Add <ChevronDown className="ml-1 h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                {QUICK_ADD.map((a) => (
                  <DropdownMenuItem key={a.href} asChild>
                    <Link href={a.href}>
                      <a.icon className="text-muted-foreground" /> {a.label}
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </motion.header>

      {/* Financial overview: earned, collected, owed; then profit and cash on hand. */}
      <section aria-labelledby="cc-money" className="space-y-3">
        <SectionEyebrow id="cc-money">Revenue &amp; collections</SectionEyebrow>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
          <div className="col-span-2 lg:col-span-1">
            <KpiCard
              size="lg"
              label={`Revenue ${year}`}
              value={t?.revenue ?? 0}
              icon={LineChart}
              tone="primary"
              loading={annualLoading}
              trend={yoy != null ? { value: yoy, label: `vs ${year - 1}` } : null}
              hint={yoy == null ? "Excl. GST, by event date" : undefined}
              spark={monthSpark("revenue")}
              href={`/performance/${year}`}
              className="bg-gradient-to-b from-primary/[0.08] to-transparent"
            />
          </div>
          <KpiCard
            size="lg"
            label={`Cash received ${year}`}
            value={t?.cashReceived ?? 0}
            icon={ArrowDownLeft}
            tone="teal"
            loading={annualLoading}
            delay={0.05}
            hint="From clients, by payment date"
            spark={monthSpark("cashReceived")}
            href={`/performance/${year}`}
          />
          <KpiCard
            size="lg"
            label="Outstanding"
            value={receivables.data?.totalReceivables ?? 0}
            icon={Banknote}
            tone="warning"
            loading={receivables.isLoading}
            delay={0.1}
            hint={receivables.error && !receivables.data ? "Couldn't load receivables" : "All clients, incl. GST, net of payments"}
            href="/finance/receivables"
          />
        </div>
        <SectionEyebrow className="pt-2">Profit &amp; liquidity</SectionEyebrow>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
          <KpiCard
            label={`Gross profit ${year}`}
            value={t?.grossProfit ?? 0}
            icon={Scale}
            tone={t && t.grossProfit < 0 ? "out" : "neutral"}
            loading={annualLoading}
            delay={0.15}
            hint={t ? `${formatPercentage(t.grossMarginPct)} gross margin` : undefined}
            spark={monthSpark("grossProfit")}
            href={`/performance/${year}`}
          />
          <KpiCard
            label={`Net profit ${year}`}
            value={t?.netProfit ?? 0}
            icon={Landmark}
            tone={t && t.netProfit < 0 ? "out" : "neutral"}
            loading={annualLoading}
            delay={0.2}
            hint={t ? `${formatPercentage(t.netMarginPct)} net margin` : undefined}
            spark={monthSpark("netProfit")}
            href={`/performance/${year}`}
          />
          <div className="col-span-2 lg:col-span-1">
            <KpiCard
              label="Cash position"
              value={cashPosition}
              icon={Wallet}
              tone="neutral"
              loading={finance.isLoading}
              delay={0.25}
              hint={finance.error && !finance.data ? "Couldn't load fund balances" : `Across ${fundCount} fund account${fundCount === 1 ? "" : "s"}, today`}
              href="/fund-transfers"
            />
          </div>
        </div>
        {annual.error && !annual.data && (
          <p role="alert" className="text-xs text-destructive">
            Couldn't load {year} performance figures.{" "}
            <button type="button" className="font-medium underline" onClick={() => annual.refetch()}>
              Try again
            </button>
          </p>
        )}
      </section>

      {/* Performance + attention */}
      <SectionEyebrow className="pt-1">Performance &amp; priorities</SectionEyebrow>
      <div className="grid gap-4 sm:gap-5 xl:grid-cols-12">
        <Reveal className="min-w-0 xl:col-span-8" delay={0.1}>
          <PerformanceChart
            data={annual.data}
            year={year}
            loading={annual.isPlaceholderData}
            error={annual.error}
            onRetry={() => annual.refetch()}
          />
        </Reveal>
        <Reveal className="min-w-0 xl:col-span-4" delay={0.18}>
          <AttentionPanel
            items={attention}
            loading={receivables.isLoading || inProgress.isLoading || upcoming.isLoading}
            error={receivables.data ? null : receivables.error}
            onRetry={() => receivables.refetch()}
          />
        </Reveal>
      </div>

      {/* Events + activity */}
      <SectionEyebrow className="pt-1">Operations</SectionEyebrow>
      <div className="grid gap-4 sm:gap-5 xl:grid-cols-12">
        <Reveal className="min-w-0 xl:col-span-8">
          <EventsPanel
            events={activeEvents}
            loading={inProgress.isLoading || upcoming.isLoading}
            error={inProgress.data && upcoming.data ? null : (inProgress.error ?? upcoming.error)}
            onRetry={() => {
              inProgress.refetch();
              upcoming.refetch();
            }}
          />
        </Reveal>
        <Reveal className="min-w-0 xl:col-span-4" delay={0.08}>
          <ActivityFeed
            logs={logs}
            clients={clientNames}
            funds={fundNames}
            loading={audit.isLoading}
            error={audit.data ? null : audit.error}
            onRetry={() => audit.refetch()}
            activityHref={`/performance/${currentYear}/${now.getMonth() + 1}/activity`}
          />
        </Reveal>
      </div>

      {/* Secondary */}
      <SectionEyebrow className="pt-1">Pipeline &amp; mix</SectionEyebrow>
      <div className="grid gap-4 sm:gap-5 lg:grid-cols-12">
        <Reveal className="min-w-0 lg:col-span-4">
          <PipelineCard summary={summary.data} loading={summary.isLoading} error={summary.error} onRetry={() => summary.refetch()} />
        </Reveal>
        <Reveal className="min-w-0 lg:col-span-8" delay={0.08}>
          <EventTypeChart data={eventTypes.data} year={year} loading={eventTypes.isLoading} error={eventTypes.error} onRetry={() => eventTypes.refetch()} />
        </Reveal>
      </div>
    </div>
  );
}
