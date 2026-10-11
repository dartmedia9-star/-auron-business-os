import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { fadeUp, staggerContainer, STAGGER, useMotionProfile } from "@/lib/motion";

/*
 * Section entrance: fades and rises once when it first scrolls into view.
 * Below-the-fold content therefore animates when it is seen, not all at once
 * on load. With reduced motion it only fades.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  as = "div",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: "div" | "section" | "li";
}) {
  const { intensity, distance } = useMotionProfile();
  const Comp = motion[as];
  return (
    <Comp
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "0px 0px -40px 0px" }}
      variants={fadeUp(intensity === "reduced", 8 * distance, delay)}
    >
      {children}
    </Comp>
  );
}

/* A group whose StaggerItem children enter one after another. */
export function Stagger({
  children,
  className,
  stagger = STAGGER,
  delay = 0,
  inView = false,
  as = "div",
}: {
  children: ReactNode;
  className?: string;
  stagger?: number;
  delay?: number;
  /** Start when scrolled into view instead of on mount. */
  inView?: boolean;
  as?: "div" | "ul" | "ol" | "tbody";
}) {
  const Comp = motion[as];
  const trigger = inView
    ? { whileInView: "show", viewport: { once: true, margin: "0px 0px -40px 0px" } }
    : { animate: "show" };
  return (
    <Comp className={className} initial="hidden" variants={staggerContainer(stagger, delay)} {...trigger}>
      {children}
    </Comp>
  );
}

export function StaggerItem({
  children,
  className,
  as = "div",
  onClick,
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "li" | "tr";
  onClick?: () => void;
}) {
  const { intensity, distance } = useMotionProfile();
  const Comp = motion[as];
  return (
    <Comp className={className} variants={fadeUp(intensity === "reduced", 8 * distance)} onClick={onClick}>
      {children}
    </Comp>
  );
}
