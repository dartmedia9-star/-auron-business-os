import type { ComponentType, ReactNode } from "react";
import { AlertTriangle, Inbox, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// API errors read "HTTP 400 Bad Request: <server message>"; show the message.
export function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message.replace(/^HTTP \d+[^:]*:\s*/, "");
  return "Something went wrong";
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  compact = false,
  className,
}: {
  icon?: ComponentType<{ className?: string }>;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  /** Borderless and shorter, for use inside a card that already has a frame. */
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex animate-fade-up flex-col items-center justify-center gap-3 text-center",
        compact ? "px-4 py-8" : "rounded-xl border border-dashed bg-card/50 px-6 py-12",
        className,
      )}
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-xl border bg-card text-muted-foreground shadow-xs">
        <Icon className="h-5 w-5" />
      </span>
      <div className="max-w-sm space-y-1">
        <p className="font-medium">{title}</p>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({
  title = "Couldn't load this",
  error,
  onRetry,
  compact = false,
  className,
}: {
  title?: string;
  error?: unknown;
  onRetry?: () => void;
  /** Borderless and shorter, for use inside a card that already has a frame. */
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex animate-fade-up flex-col items-center justify-center gap-3 text-center",
        compact ? "px-4 py-8" : "rounded-xl border border-destructive/25 bg-destructive/[0.03] px-6 py-10",
        className,
      )}
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
        <AlertTriangle className="h-5 w-5" />
      </span>
      <div className="max-w-md space-y-1">
        <p className="font-medium">{title}</p>
        {error !== undefined && <p className="text-sm text-muted-foreground">{errorMessage(error)}</p>}
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="mr-2 h-3.5 w-3.5" /> Try again
        </Button>
      )}
    </div>
  );
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="divide-y" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 px-4 py-3.5">
          {Array.from({ length: cols }).map((__, c) => (
            <Skeleton key={c} className={cn("h-4", c === 0 ? "w-20" : c === cols - 1 ? "ml-auto w-24" : "flex-1")} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardsSkeleton({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-3 lg:grid-cols-4", className)} aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border bg-card p-5 shadow-card">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-4 h-7 w-32" />
        </div>
      ))}
    </div>
  );
}

/* Placeholder shaped like a bar/line chart. */
export function ChartSkeleton({ className }: { className?: string }) {
  const bars = [38, 52, 44, 66, 58, 72, 49, 63, 80, 57, 69, 75];
  return (
    <div className={cn("flex h-full min-h-[200px] items-end gap-2 px-2 pb-6 pt-4", className)} aria-busy="true" aria-label="Loading chart">
      {bars.map((h, i) => (
        <Skeleton key={i} className="flex-1 rounded-t-md rounded-b-none" style={{ height: `${h}%` }} />
      ))}
    </div>
  );
}

/* Placeholder shaped like a list of rows with a leading icon. */
export function ListSkeleton({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-4", className)} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 shrink-0 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

/* Generic page placeholder: header, KPI row and a content block. */
export function PageSkeleton({ kpis = 4 }: { kpis?: number }) {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      {kpis > 0 && <CardsSkeleton count={kpis} />}
      <div className="rounded-xl border bg-card shadow-card">
        <TableSkeleton />
      </div>
    </div>
  );
}
