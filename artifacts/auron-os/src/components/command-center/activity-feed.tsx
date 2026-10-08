import { useMemo } from "react";
import { Link } from "wouter";
import { ArrowRight, History } from "lucide-react";
import type { AuditLog } from "@workspace/api-client-react";
import { SectionHeader } from "@/components/ds/section-header";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/ds/states";
import { ActivityItem, Timeline } from "@/components/ds/timeline";
import { Button } from "@/components/ui/button";
import { activityAmountText, describeAuditLog } from "@/lib/activity";

/*
 * Recent Financial Activity, read from the existing audit log. Only money
 * actions (payments, allocations, expenses, transfers, fund accounts) are
 * audited today, so the feed is labelled as financial activity.
 */
export function ActivityFeed({
  logs,
  clients,
  funds,
  loading,
  error,
  onRetry,
  activityHref,
}: {
  logs: AuditLog[];
  clients: Map<number, string>;
  funds: Map<number, string>;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  activityHref: string;
}) {
  const lines = useMemo(
    () =>
      logs.map((log) => ({
        log,
        line: describeAuditLog(log, { clientName: (id) => clients.get(id), fundName: (id) => funds.get(id) }),
      })),
    [logs, clients, funds],
  );

  return (
    <section className="flex min-w-0 flex-col rounded-xl border bg-card shadow-card">
      <SectionHeader
        className="px-4 pt-4 sm:px-5 sm:pt-5"
        title="Recent financial activity"
        description="Payments, expenses and fund movements"
        action={
          <Button variant="ghost" size="sm" asChild className="text-muted-foreground">
            <Link href={activityHref}>
              View log <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </Button>
        }
      />
      <div className="mt-2 flex-1 px-4 pb-3 sm:px-5">
        {error ? (
          <ErrorState compact title="Couldn't load activity" error={error} onRetry={onRetry} />
        ) : loading ? (
          <ListSkeleton rows={5} className="py-3" />
        ) : lines.length === 0 ? (
          <EmptyState compact icon={History} title="No financial activity yet" description="Payments, expenses and transfers will appear here as they're recorded." />
        ) : (
          <Timeline>
            {lines.map(({ log, line }) => (
              <ActivityItem
                key={log.id}
                kind={line.kind}
                title={line.title}
                detail={line.detail}
                amount={activityAmountText(line)}
                at={log.createdAt}
                href={line.href}
              />
            ))}
          </Timeline>
        )}
      </div>
    </section>
  );
}
