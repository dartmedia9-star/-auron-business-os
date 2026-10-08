import type { ComponentType, ReactNode } from "react";
import { Link } from "wouter";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, CircleDot, RotateCcw } from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import { cn } from "@/lib/utils";
import { fadeUp, staggerContainer } from "@/lib/motion";
import type { ActivityKind } from "@/lib/activity";

const KIND: Record<ActivityKind, { icon: ComponentType<{ className?: string }>; className: string; amount: string }> = {
  in: { icon: ArrowDownLeft, className: "bg-success/10 text-success", amount: "text-money-in" },
  out: { icon: ArrowUpRight, className: "bg-destructive/8 text-destructive", amount: "text-foreground" },
  internal: { icon: ArrowLeftRight, className: "bg-teal/10 text-teal", amount: "text-foreground" },
  warning: { icon: RotateCcw, className: "bg-warning/10 text-warning", amount: "text-muted-foreground line-through decoration-1" },
  neutral: { icon: CircleDot, className: "bg-muted text-muted-foreground", amount: "text-foreground" },
};

/* Vertical list joined by a hairline; items enter one after another. */
export function Timeline({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.ol
      className={cn("relative space-y-1 before:absolute before:bottom-4 before:left-[15px] before:top-4 before:w-px before:bg-border", className)}
      initial="hidden"
      animate="show"
      variants={staggerContainer(0.04, 0.1)}
    >
      {children}
    </motion.ol>
  );
}

export function ActivityItem({
  kind,
  title,
  detail,
  amount,
  at,
  href,
}: {
  kind: ActivityKind;
  title: string;
  detail?: string | null;
  amount?: string | null;
  at: string;
  href?: string | null;
}) {
  const reduce = useReducedMotion();
  const meta = KIND[kind];
  const Icon = meta.icon;
  const when = new Date(at);
  const body = (
    <div className="flex items-start gap-3 rounded-lg px-0 py-2 transition-colors duration-150">
      <span className={cn("relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-4 ring-card", meta.className)}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="truncate text-sm font-medium group-hover:text-foreground">{title}</p>
          {amount && <span className={cn("shrink-0 text-sm font-medium tabular-nums", meta.amount)}>{amount}</span>}
        </div>
        <div className="mt-0.5 flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
          <span className="truncate">{detail ?? " "}</span>
          <time dateTime={at} title={when.toLocaleString("en-IN")} className="shrink-0">
            {formatDistanceToNowStrict(when, { addSuffix: true })}
          </time>
        </div>
      </div>
    </div>
  );
  return (
    <motion.li variants={fadeUp(reduce, 6)} className="group">
      {href ? (
        <Link href={href} className="-mx-2 block rounded-lg px-2 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {body}
        </Link>
      ) : (
        body
      )}
    </motion.li>
  );
}
