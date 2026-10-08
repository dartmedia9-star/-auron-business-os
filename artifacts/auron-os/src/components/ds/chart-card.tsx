import type { ReactNode } from "react";
import { BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChartSkeleton, EmptyState, ErrorState } from "./states";

/*
 * Card frame for a chart with its own loading, error and empty states, so a
 * slow or failing chart never blanks the rest of the page.
 */
export function ChartCard({
  title,
  description,
  actions,
  footer,
  loading,
  error,
  onRetry,
  empty,
  emptyTitle = "Nothing to chart yet",
  emptyDescription,
  height = "h-[260px] sm:h-[300px]",
  className,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  empty?: boolean;
  emptyTitle?: string;
  emptyDescription?: ReactNode;
  height?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("flex min-w-0 flex-col rounded-xl border bg-card shadow-card", className)}>
      <header className="flex flex-col gap-3 px-4 pt-4 sm:flex-row sm:items-start sm:justify-between sm:px-5 sm:pt-5">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold tracking-tight">{title}</h3>
          {description && <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </header>
      <div className={cn("relative min-w-0 px-1 pb-2 pt-3 sm:px-3", height)}>
        {error ? (
          <ErrorState compact title="Couldn't load this chart" error={error} onRetry={onRetry} className="h-full" />
        ) : loading ? (
          <ChartSkeleton className="h-full" />
        ) : empty ? (
          <EmptyState compact icon={BarChart3} title={emptyTitle} description={emptyDescription} className="h-full" />
        ) : (
          children
        )}
      </div>
      {footer && <footer className="border-t px-4 py-3 sm:px-5">{footer}</footer>}
    </section>
  );
}
