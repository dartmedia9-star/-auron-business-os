import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { EASE_OUT, springFor, useMotionProfile } from "@/lib/motion";

/*
 * Lists whose rows can be added or removed (ledger rows, notes, catalog
 * items). New rows fade and grow in, removed rows fade and collapse, and the
 * rest slide to their new place. The first render does not animate, so a
 * page full of rows appears at once. Reduced motion: rows simply appear.
 */
export function AnimatedList({ children }: { children: ReactNode }) {
  return <AnimatePresence initial={false}>{children}</AnimatePresence>;
}

export function AnimatedItem({
  children,
  className,
  as = "div",
  ...rest
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "li" | "tr";
} & Record<`data-${string}`, string | undefined>) {
  const profile = useMotionProfile();
  const reduce = profile.intensity === "reduced";
  const Comp = motion[as];
  return (
    <Comp
      layout={reduce ? false : "position"}
      className={className}
      initial={reduce ? false : { opacity: 0, y: 6 * profile.distance }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.28 * profile.scale, ease: EASE_OUT } }}
      exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, transition: { duration: 0.16 * profile.scale } }}
      transition={springFor(profile)}
      {...rest}
    >
      {children}
    </Comp>
  );
}
