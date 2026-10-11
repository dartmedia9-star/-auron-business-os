import { useCallback, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useLocation } from "wouter";
import { EASE_OUT, useMotionProfile } from "@/lib/motion";

export const MAIN_SCROLL_ID = "main-content";

/*
 * Route transitions. The outgoing page fades and lifts away quickly, then the
 * incoming page rises into place; the shell (sidebar, header) never moves.
 *
 * Each page is rendered for the location it was mounted with (`render` gets
 * that location and passes it to <Switch location>), so the page on its way
 * out keeps showing itself instead of flashing the next route. The main
 * scroll area returns to the top once the old page has gone.
 * Reduced motion: pages swap instantly.
 */
export function RouteTransition({ render }: { render: (location: string) => ReactNode }) {
  const [location] = useLocation();
  const profile = useMotionProfile();
  const reduce = profile.intensity === "reduced";

  const resetScroll = useCallback(() => {
    document.getElementById(MAIN_SCROLL_ID)?.scrollTo({ top: 0 });
  }, []);

  return (
    <AnimatePresence mode="wait" initial={false} onExitComplete={resetScroll}>
      <motion.div
        key={location}
        initial={reduce ? false : { opacity: 0, y: 14 * profile.distance, scale: 0.995 }}
        animate={{ opacity: 1, y: 0, scale: 1, transition: reduce ? { duration: 0 } : { duration: 0.3 * profile.scale, ease: EASE_OUT } }}
        exit={reduce ? { opacity: 1, transition: { duration: 0 } } : { opacity: 0, y: -6 * profile.distance, transition: { duration: 0.1 * profile.scale, ease: [0.4, 0, 1, 1] } }}
        style={{ transformOrigin: "50% 0" }}
        data-route={location}
      >
        {render(location)}
      </motion.div>
    </AnimatePresence>
  );
}
