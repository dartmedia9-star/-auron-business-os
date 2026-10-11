import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ThemeProvider } from "next-themes";
import { MotionConfig } from "framer-motion";
import {
  DEFAULT_EXPERIENCE,
  EXPERIENCE_STORAGE_KEY,
  ExperienceContext,
  THEME_STORAGE_KEY,
  applyExperience,
  readExperience,
  type ExperiencePrefs,
} from "@/lib/experience";
import { MOTION_PROFILES, MotionProfileContext } from "@/lib/motion";

function loadPrefs(): ExperiencePrefs {
  try {
    return readExperience(window.localStorage.getItem(EXPERIENCE_STORAGE_KEY));
  } catch {
    return DEFAULT_EXPERIENCE;
  }
}

/*
 * Theme (next-themes) + Appearance & Experience preferences + the app-wide
 * motion configuration. Midnight is the default only when nothing has been
 * saved; a saved choice is always kept.
 */
export function ExperienceProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<ExperiencePrefs>(loadPrefs);

  useEffect(() => {
    applyExperience(prefs);
    try {
      window.localStorage.setItem(EXPERIENCE_STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      // Private mode or storage blocked: the choice still applies for this visit.
    }
  }, [prefs]);

  // Keep other open tabs in step.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === EXPERIENCE_STORAGE_KEY) setPrefs(readExperience(e.newValue));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setPref = useCallback(<K extends keyof ExperiencePrefs>(key: K, value: ExperiencePrefs[K]) => {
    setPrefs((p) => (p[key] === value ? p : { ...p, [key]: value }));
  }, []);
  const reset = useCallback(() => setPrefs(DEFAULT_EXPERIENCE), []);
  const value = useMemo(() => ({ prefs, setPref, reset }), [prefs, setPref, reset]);

  return (
    <ThemeProvider attribute="class" storageKey={THEME_STORAGE_KEY} defaultTheme="dark" enableSystem disableTransitionOnChange>
      <ExperienceContext.Provider value={value}>
        <MotionProfileContext.Provider value={MOTION_PROFILES[prefs.motion]}>
          <MotionConfig reducedMotion={prefs.motion === "reduced" ? "always" : "user"}>{children}</MotionConfig>
        </MotionProfileContext.Provider>
      </ExperienceContext.Provider>
    </ThemeProvider>
  );
}
