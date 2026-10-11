import { createContext, useContext } from "react";
import { useReducedMotionConfig, type Transition, type Variants } from "framer-motion";

/*
 * Auron motion language. Short, decelerating, transform/opacity only.
 * Everything that moves uses these values so the app feels like one product.
 * Reduced motion (the OS setting or the "Reduced" preference) is honoured by
 * the components through useReduceMotion() and by the CSS override in
 * index.css.
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

/* Springs: interactive feedback settles quickly without wobbling. */
export const SPRING = {
  /** Hover and press on cards and buttons. */
  press: { type: "spring", stiffness: 520, damping: 32, mass: 0.7 },
  /** Panels, pills and indicators that slide between positions. */
  layout: { type: "spring", stiffness: 420, damping: 38 },
  /** Overlays (dialogs, popovers, drawers) entering. */
  overlay: { type: "spring", stiffness: 380, damping: 34 },
} as const satisfies Record<string, Transition>;

/* ---------------------------------------------------------------------------
 * Animation intensity (Appearance & Experience). Balanced is the default;
 * Expressive travels further and settles a little slower; Reduced turns
 * movement off (MotionConfig reducedMotion="always" + CSS override).
 * ------------------------------------------------------------------------ */
export type MotionIntensity = "expressive" | "balanced" | "reduced";

export type MotionProfile = {
  intensity: MotionIntensity;
  /** Multiplier for durations. */
  scale: number;
  /** Multiplier for travel distances (y / x offsets, scale deltas). */
  distance: number;
};

export const MOTION_PROFILES: Record<MotionIntensity, MotionProfile> = {
  expressive: { intensity: "expressive", scale: 1.15, distance: 1.6 },
  balanced: { intensity: "balanced", scale: 1, distance: 1 },
  reduced: { intensity: "reduced", scale: 0, distance: 0 },
};

export const MotionProfileContext = createContext<MotionProfile>(MOTION_PROFILES.balanced);

/**
 * True when movement should be skipped: the OS asks for reduced motion or
 * the user picked "Reduced". Use this instead of framer's useReducedMotion,
 * which only reads the OS setting.
 */
export function useReduceMotion(): boolean {
  return useReducedMotionConfig() ?? false;
}

/** The active intensity, with Reduced also applied for the OS setting. */
export function useMotionProfile(): MotionProfile {
  const profile = useContext(MotionProfileContext);
  return useReduceMotion() ? MOTION_PROFILES.reduced : profile;
}

/**
 * A spring tuned to the intensity: Expressive settles with a touch more
 * overshoot, Reduced jumps straight to the end.
 */
export function springFor(profile: MotionProfile, base: { stiffness: number; damping: number; mass?: number } = SPRING.layout): Transition {
  if (profile.intensity === "reduced") return { duration: 0 };
  const damping = profile.intensity === "expressive" ? base.damping * 0.78 : base.damping;
  return { type: "spring", stiffness: base.stiffness, damping, mass: base.mass ?? 1 };
}
