import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { animate } from "framer-motion";
import { DURATION, EASE_OUT, useReduceMotion } from "@/lib/motion";

/*
 * Counts from the previously shown value to `value` once, quickly. Used for
 * headline financial KPIs only; with reduced motion the final value shows
 * immediately. The final rendered text is always the exact formatted value.
 * When the value changes after it first appeared (a refetch, a year switch),
 * a brief highlight marks the figure as updated; first render never flashes.
 */
export function AnimatedNumber({
  value,
  format,
  duration = DURATION.number,
  delay = 0,
  className,
}: {
  value: number;
  format: (n: number) => string;
  duration?: number;
  /** Seconds to wait before counting, to stagger a row of figures. */
  delay?: number;
  className?: string;
}) {
  const reduceMotion = useReduceMotion();
  const [updates, setUpdates] = useState(0);
  const last = useRef(value);
  useEffect(() => {
    if (last.current !== value) setUpdates((n) => n + 1);
    last.current = value;
  }, [value]);
  const [display, setDisplay] = useState(reduceMotion ? value : 0);
  const from = useRef(reduceMotion ? value : 0);

  useEffect(() => {
    if (reduceMotion) {
      setDisplay(value);
      from.current = value;
      return;
    }
    const controls = animate(from.current, value, {
      duration,
      delay,
      ease: EASE_OUT,
      onUpdate: (latest) => setDisplay(latest),
      onComplete: () => setDisplay(value),
    });
    from.current = value;
    return () => controls.stop();
  }, [value, duration, delay, reduceMotion]);

  return (
    <span className={cn("relative", className)} aria-label={format(value)} data-updated={updates || undefined}>
      {updates > 0 && (
        <span key={updates} aria-hidden className="pointer-events-none absolute -inset-x-1.5 -inset-y-0.5 rounded-md animate-pulse-highlight" />
      )}
      <span aria-hidden className="relative">{format(display)}</span>
    </span>
  );
}
