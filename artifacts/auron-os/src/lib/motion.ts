import type { Transition, Variants } from "framer-motion";

/*
 * Auron motion language. Short, decelerating, transform/opacity only.
 * Everything that moves uses these values so the app feels like one product.
 * Reduced motion is honoured by the components (useReducedMotion) and by the
 * global CSS override in index.css.
 */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;
export const EASE_IN_OUT = [0.65, 0, 0.35, 1] as const;

export const DURATION = {
  fast: 0.15, // hover, press, small state changes
  base: 0.24, // page and section entrances
  slow: 0.4, // larger reveals
  number: 0.8, // KPI count-up
  chart: 0.7, // chart draw / grow
} as const;

/** Delay between siblings in a staggered group (seconds). */
export const STAGGER = 0.05;

export const transition = (duration: number = DURATION.base, delay = 0): Transition => ({
  duration,
  delay,
  ease: EASE_OUT,
});

/** Children fade and rise into place one after another. */
export const staggerContainer = (stagger: number = STAGGER, delayChildren = 0): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: stagger, delayChildren } },
});

export const fadeUp = (reduce: boolean | null, distance = 8, delay = 0): Variants => ({
  hidden: reduce ? { opacity: 0 } : { opacity: 0, y: distance },
  show: { opacity: 1, y: 0, transition: transition(reduce ? DURATION.fast : DURATION.slow, delay) },
});
