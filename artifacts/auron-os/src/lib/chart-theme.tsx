import type { ReactNode } from "react";
import { useMotionProfile } from "@/lib/motion";
import { cn } from "@/lib/utils";

/*
 * One look for every recharts chart: quiet dashed grid, muted axis labels,
 * the theme's chart-1..5 series, a glass tooltip card and entry/update
 * animation that follows the Appearance & Experience motion choice.
 */
export const chartGrid = { stroke: "var(--color-border)", strokeOpacity: 0.6, strokeDasharray: "3 4" } as const;

export const chartAxis = {
  tickLine: false,
  axisLine: false,
  fontSize: 11,
  stroke: "var(--color-muted-foreground)",
} as const;

export const chartCursor = { fill: "var(--color-muted)", opacity: 0.5 } as const;

/** For charts that keep recharts' default tooltip. */
export const chartTooltipStyle = {
  contentStyle: {
    borderRadius: 12,
    border: "1px solid var(--color-popover-border)",
    background: "var(--color-popover)",
    color: "var(--color-popover-foreground)",
    fontSize: 12,
    boxShadow: "var(--shadow-lift)",
  },
  labelStyle: { color: "var(--color-foreground)", fontWeight: 500, marginBottom: 4 },
  itemStyle: { color: "var(--color-foreground)", padding: 0 },
} as const;

/** Entry and data-change animation for bars, lines and areas. Off under reduced motion. */
export function useChartAnimation(order = 0) {
  const profile = useMotionProfile();
  const on = profile.intensity !== "reduced";
  return {
    isAnimationActive: on,
    animationBegin: on ? Math.round(order * 90 * profile.scale) : 0,
    animationDuration: Math.round(750 * (on ? profile.scale : 1)),
    animationEasing: "ease-out" as const,
  };
}

/** Custom tooltip frame matching the rest of the overlays. */
export function ChartTooltipCard({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("glass-strong rounded-xl px-3 py-2.5 text-xs", className)}>{children}</div>;
}
