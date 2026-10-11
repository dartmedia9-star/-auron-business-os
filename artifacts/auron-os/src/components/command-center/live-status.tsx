import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Pause, Play, RefreshCw } from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useExperience } from "@/lib/experience";
import { EASE_OUT, useReduceMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";

/* How often the Command Center re-reads its endpoints while live. */
export const LIVE_INTERVAL_MS = 60_000;

/*
 * Query options for live updates, driven by the Appearance & Experience
 * "live updates" preference. Only the polling interval changes; the queries,
 * their endpoints and their data are the same. Polling stops while the tab
 * is hidden (TanStack's default).
 */
export function useLiveQueryOptions() {
  const { prefs } = useExperience();
  return { refetchInterval: prefs.liveUpdates ? LIVE_INTERVAL_MS : (false as const) };
}

type Refreshable = { dataUpdatedAt: number; isFetching: boolean; isLoading: boolean; error: unknown; data?: unknown; refetch: () => unknown };

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

function ago(at: number, now: number): string {
  if (!at) return "not loaded yet";
  if (now - at < 10_000) return "just now";
  return formatDistanceToNowStrict(at, { addSuffix: true });
}

/*
 * Live / Paused status with "Updated … ago", a pause/resume toggle (the same
 * preference as Settings) and a manual refresh that always works, paused or
 * not. A background refresh that fails keeps the last data on screen and
 * says so here.
 */
export function LiveStatus({ queries, className }: { queries: Refreshable[]; className?: string }) {
  const { prefs, setPref } = useExperience();
  const reduce = useReduceMotion();
  const now = useNow(5_000);
  const live = prefs.liveUpdates;
  const updatedAt = Math.max(0, ...queries.map((q) => q.dataUpdatedAt));
  const refreshing = queries.some((q) => q.isFetching && !q.isLoading);
  const stale = queries.some((q) => q.error && q.data !== undefined);

  const refreshAll = () => {
    for (const q of queries) q.refetch();
  };
  const toggle = () => {
    const next = !live;
    setPref("liveUpdates", next);
    // Resuming catches up straight away rather than waiting a full interval.
    if (next) refreshAll();
  };

  return (
    <div
      className={cn("glass flex h-9 items-center gap-1 rounded-full pl-3 pr-1 text-xs", className)}
      data-testid="live-status"
      data-live={live ? "on" : "off"}
    >
      <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
        {live && !reduce && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/60 [animation-duration:2.4s]" />}
        <span className={cn("relative inline-flex h-2 w-2 rounded-full transition-colors duration-300", live ? "bg-success" : "bg-muted-foreground/60")} />
      </span>
      <span className="ml-1 font-medium">{live ? "Live" : "Paused"}</span>
      <span className="min-w-0 truncate text-muted-foreground" aria-live="polite" data-testid="live-updated">
        <span aria-hidden> · </span>
        {stale ? (
          <span className="text-warning">Couldn't refresh, showing data from {ago(updatedAt, now)}</span>
        ) : (
          <>Updated {ago(updatedAt, now)}</>
        )}
      </span>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="ml-1 h-7 w-7 shrink-0 rounded-full"
            onClick={toggle}
            aria-label={live ? "Pause live updates" : "Resume live updates"}
            aria-pressed={!live}
            data-testid="live-toggle"
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={live ? "pause" : "play"}
                initial={reduce ? false : { scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { scale: 0.6, opacity: 0 }}
                transition={{ duration: 0.14, ease: EASE_OUT }}
                className="flex"
              >
                {live ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              </motion.span>
            </AnimatePresence>
          </Button>
        </TooltipTrigger>
        <TooltipContent>{live ? "Pause automatic updates" : "Resume automatic updates (every minute)"}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 rounded-full"
            onClick={refreshAll}
            disabled={refreshing}
            aria-label="Refresh now"
            data-testid="live-refresh"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Refresh now</TooltipContent>
      </Tooltip>
    </div>
  );
}
