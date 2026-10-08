import { useId } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { DURATION, EASE_OUT } from "@/lib/motion";
import { cn } from "@/lib/utils";

/*
 * Tiny trend line for a KPI. Decorative (aria-hidden): the KPI's figure is the
 * accessible value. Draws in once; colour comes from currentColor.
 */
export function Sparkline({
  values,
  className,
  delay = 0,
}: {
  values: number[];
  className?: string;
  delay?: number;
}) {
  const reduce = useReducedMotion();
  const gradientId = useId().replace(/:/g, "");
  const clipId = useId().replace(/:/g, "");
  if (values.length < 2 || values.every((v) => v === 0)) return null;

  const w = 100;
  const h = 28;
  const min = Math.min(...values, 0);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = w / (values.length - 1);
  const points = values.map((v, i) => [i * step, h - 2 - ((v - min) / span) * (h - 4)] as const);
  const line = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={cn("h-7 w-full overflow-visible", className)} aria-hidden>
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity={0.18} />
          <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
        </linearGradient>
        {/* Revealed left to right by a growing clip, so the stroke stays crisp. */}
        <clipPath id={clipId}>
          <motion.rect
            x={0}
            y={-4}
            height={h + 8}
            initial={{ width: reduce ? w : 0 }}
            animate={{ width: w }}
            transition={{ duration: reduce ? 0 : DURATION.chart, delay, ease: EASE_OUT }}
          />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <path d={area} fill={`url(#${gradientId})`} />
        <path d={line} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </g>
    </svg>
  );
}
