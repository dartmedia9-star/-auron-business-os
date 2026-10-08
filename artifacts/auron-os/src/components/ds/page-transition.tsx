import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

/* Short fade/rise when the route changes. No movement with reduced motion. */
export function PageTransition({ routeKey, children }: { routeKey: string; children: ReactNode }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      key={routeKey}
      initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
