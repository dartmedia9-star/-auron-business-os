import { useEffect, useRef, useState } from "react";
import { animate, useReducedMotion } from "framer-motion";

/*
 * Counts from the previously shown value to `value` once, quickly. Used for
 * headline financial KPIs only; with reduced motion the final value shows
 * immediately. The final rendered text is always the exact formatted value.
 */
export function AnimatedNumber({
  value,
  format,
  duration = 0.6,
  className,
}: {
  value: number;
  format: (n: number) => string;
  duration?: number;
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
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => setDisplay(latest),
      onComplete: () => setDisplay(value),
    });
    from.current = value;
    return () => controls.stop();
  }, [value, duration, reduceMotion]);

  return (
    <span className={className} aria-label={format(value)}>
      <span aria-hidden>{format(display)}</span>
    </span>
  );
}
