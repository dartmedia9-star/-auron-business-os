import { createContext, useContext } from "react";
import type { MotionIntensity } from "@/lib/motion";

/*
 * Appearance & Experience preferences. Saved per browser (localStorage), never
 * sent to the server. The colour theme itself is stored separately by
 * next-themes under THEME_STORAGE_KEY ("dark" = Midnight, "light" = Daylight,
 * "system" = follow the device).
 *
 * The inline script in index.html applies the same keys before React loads so
 * the first paint already has the right theme and attributes; keep the two in
 * step if a key or default changes.
 */
export const THEME_STORAGE_KEY = "auron-theme";
export const EXPERIENCE_STORAGE_KEY = "auron-experience";

export type ThemeChoice = "dark" | "light" | "system";

export type ExperiencePrefs = {
  motion: MotionIntensity;
  /** Blur and translucency on glass surfaces. Off = solid surfaces. */
  glass: boolean;
  /** Command Center refreshes itself (and animates updates) while visible. */
  liveUpdates: boolean;
  /** Brighter secondary text, firmer borders, near-solid glass. */
  enhancedContrast: boolean;
};

export const DEFAULT_EXPERIENCE: ExperiencePrefs = {
  motion: "balanced",
  glass: true,
  liveUpdates: true,
  enhancedContrast: false,
};

const MOTION_VALUES: MotionIntensity[] = ["expressive", "balanced", "reduced"];

/** Reads saved preferences, ignoring anything malformed field by field. */
export function readExperience(raw: string | null): ExperiencePrefs {
  if (!raw) return DEFAULT_EXPERIENCE;
  try {
    const v = JSON.parse(raw) as Partial<Record<keyof ExperiencePrefs, unknown>>;
    return {
      motion: MOTION_VALUES.includes(v.motion as MotionIntensity) ? (v.motion as MotionIntensity) : DEFAULT_EXPERIENCE.motion,
      glass: typeof v.glass === "boolean" ? v.glass : DEFAULT_EXPERIENCE.glass,
      liveUpdates: typeof v.liveUpdates === "boolean" ? v.liveUpdates : DEFAULT_EXPERIENCE.liveUpdates,
      enhancedContrast: typeof v.enhancedContrast === "boolean" ? v.enhancedContrast : DEFAULT_EXPERIENCE.enhancedContrast,
    };
  } catch {
    return DEFAULT_EXPERIENCE;
  }
}

/** Mirrors the preferences onto <html> for the CSS in index.css. */
export function applyExperience(prefs: ExperiencePrefs, root: HTMLElement = document.documentElement) {
  root.dataset.motion = prefs.motion;
  root.dataset.glass = prefs.glass ? "on" : "off";
  root.dataset.contrast = prefs.enhancedContrast ? "more" : "normal";
}

export type ExperienceContextValue = {
  prefs: ExperiencePrefs;
  setPref: <K extends keyof ExperiencePrefs>(key: K, value: ExperiencePrefs[K]) => void;
  reset: () => void;
};

export const ExperienceContext = createContext<ExperienceContextValue>({
  prefs: DEFAULT_EXPERIENCE,
  setPref: () => {},
  reset: () => {},
});

export function useExperience(): ExperienceContextValue {
  return useContext(ExperienceContext);
}
