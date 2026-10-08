import type { ComponentType, ReactNode } from "react";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { fadeUp } from "@/lib/motion";
import { cn } from "@/lib/utils";

/*
 * Page title row, the same on every page. `back` adds a return link,
 * `icon` a small tinted mark before the title. `sticky` keeps the title and
 * primary actions visible while long finance tables scroll (it bleeds to
 * the edges of the main padding).
 */
export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  back,
  backLabel = "Back",
  icon: Icon,
  sticky = false,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  back?: string;
  backLabel?: string;
  icon?: ComponentType<{ className?: string }>;
  sticky?: boolean;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={fadeUp(reduce, 6)}
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between",
        sticky &&
          "sticky top-0 z-20 -mx-4 -mt-4 border-b border-transparent bg-background/85 px-4 pb-4 pt-4 backdrop-blur supports-[backdrop-filter]:bg-background/70 md:-mx-6 md:-mt-6 md:px-6 md:pt-6 lg:-mx-8 lg:-mt-8 lg:px-8 lg:pt-8",
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        {back && (
          <Link
            href={back}
            aria-label={backLabel}
            className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground shadow-xs transition-colors hover:text-foreground sm:mt-1"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
        )}
        <div className="min-w-0">
          {eyebrow && <div className="mb-1 text-xs font-medium uppercase tracking-[0.12em] text-gold-ink">{eyebrow}</div>}
          <h2 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight sm:text-[28px]">
            {Icon && (
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-gold-ink">
                <Icon className="h-4 w-4" />
              </span>
            )}
            <span className="min-w-0">{title}</span>
          </h2>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </motion.div>
  );
}
