import { useEffect, useRef, useState } from "react";
import { animate, useReducedMotion } from "framer-motion";
import { DURATION, EASE_OUT } from "@/lib/motion";

/*
 * Counts from the previously shown value to `value` once, quickly. Used for
 * headline financial KPIs only; with reduced motion the final value shows
 * immediately. The final rendered text is always the exact formatted value.
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
  const reduceMotion = useReducedMotion();
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
    <span className={className} aria-label={format(value)}>
      <span aria-hidden>{format(display)}</span>
    </span>
  );
}
