import { useEffect, useRef, useState } from "react";
import { AnimatePresence, animate, motion, useReducedMotion } from "framer-motion";
import { Check, Copy } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { DURATION, EASE_OUT } from "@/lib/motion";
import { formatPaise } from "@/lib/rate-calculator";
import { useCopy } from "./shared";

/*
 * Small motion pieces used only by the Rate Calculator. Short, transform and
 * opacity only, and still with reduced motion (the page is also wrapped in
 * <MotionConfig reducedMotion="user">).
 */

/**
 * An exact ₹ amount that rolls briefly from the previous value when it
 * changes. It shows the final value on first render (no count-up on load),
 * and the settled text is always the exact formatted paise amount.
 */
export function RollingMoney({ paise, className, testId }: { paise: bigint; className?: string; testId?: string }) {
  const value = Number(paise) / 100;
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(value);
  const shown = useRef(value);

  useEffect(() => {
    if (reduce || shown.current === value) {
      shown.current = value;
      setDisplay(value);
      return;
    }
    const controls = animate(shown.current, value, {
      duration: DURATION.slow,
      ease: EASE_OUT,
      onUpdate: (v) => {
        shown.current = v;
        setDisplay(v);
      },
      onComplete: () => {
        shown.current = value;
        setDisplay(value);
      },
    });
    return () => controls.stop();
  }, [value, reduce]);

  const exact = formatPaise(paise);
  return (
    <span className={className} data-testid={testId} data-value={exact}>
      <span className="sr-only">{exact}</span>
      <span aria-hidden>{display === value ? exact : formatMoney(display)}</span>
    </span>
  );
}

/** Copy icon that briefly turns into a check after a successful copy. */
export function CopyGlyph({ copied, className = "h-3.5 w-3.5" }: { copied: boolean; className?: string }) {
  return (
    <span className="relative inline-flex">
      <AnimatePresence initial={false} mode="wait">
        <motion.span
          key={copied ? "done" : "copy"}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.6 }}
          transition={{ duration: DURATION.fast, ease: EASE_OUT }}
          className="inline-flex"
        >
          {copied ? <Check className={`${className} text-emerald-600 dark:text-emerald-400`} /> : <Copy className={className} />}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/** useCopy plus which copy action just succeeded, for inline "copied" feedback. */
export function useCopyFeedback() {
  const copy = useCopy();
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const run = async (key: string, label: string, text: string | null, extra?: string) => {
    const ok = await copy(label, text, extra);
    if (ok) {
      setCopied(key);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(null), 1500);
    }
    return ok;
  };
  return [copied, run] as const;
}

/** A small icon button that copies one figure and confirms with a check. */
export function CopyFigureButton({ label, text, className }: { label: string; text: string | null; className?: string }) {
  const [copied, run] = useCopyFeedback();
  if (text == null) return null;
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.9 }}
      onClick={() => void run("x", label, text)}
      className={`shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${className ?? ""}`}
      aria-label={`Copy ${label.toLowerCase()}`}
      title={`Copy ${label.toLowerCase()}`}
    >
      <CopyGlyph copied={copied === "x"} />
    </motion.button>
  );
}

/** Height + fade reveal for optional detail blocks. */
export const reveal = {
  initial: { height: 0, opacity: 0 },
  animate: { height: "auto", opacity: 1 },
  exit: { height: 0, opacity: 0 },
  transition: { duration: DURATION.base, ease: EASE_OUT },
} as const;
