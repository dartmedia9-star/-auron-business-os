import { cn } from "@/lib/utils";

type BadgeStyle = { className: string; label: string };

const BASE = "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset";

const EVENT_STATUS: Record<string, BadgeStyle> = {
  upcoming: { className: "bg-info/8 text-info ring-info/20", label: "Upcoming" },
  in_progress: { className: "bg-primary/12 text-gold-ink ring-primary/25", label: "In Progress" },
  completed: { className: "bg-success/8 text-success ring-success/20", label: "Completed" },
  cancelled: { className: "bg-muted text-muted-foreground ring-border", label: "Cancelled" },
};

const PROFITABILITY: Record<string, BadgeStyle> = {
  excellent: { className: "bg-success/10 text-success ring-success/25", label: "Excellent" },
  healthy: { className: "bg-success/6 text-success ring-success/15", label: "Healthy" },
  warning: { className: "bg-warning/10 text-warning ring-warning/25", label: "Warning" },
  loss: { className: "bg-destructive/8 text-destructive ring-destructive/20", label: "Loss" },
  awaiting_data: { className: "bg-muted text-muted-foreground ring-border", label: "Awaiting Data" },
};

/* Event status (upcoming / in progress / completed / cancelled). */
export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const style = EVENT_STATUS[status] ?? { className: "bg-muted text-muted-foreground ring-border", label: status.replace(/_/g, " ") };
  return (
    <span className={cn(BASE, style.className, className)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {style.label}
    </span>
  );
}

/* Event profitability indicator, as computed by the API from margin thresholds. */
export function ProfitabilityBadge({ indicator, className }: { indicator?: string | null; className?: string }) {
  const style = PROFITABILITY[indicator ?? "awaiting_data"] ?? PROFITABILITY.awaiting_data;
  return <span className={cn(BASE, style.className, className)}>{style.label}</span>;
}
