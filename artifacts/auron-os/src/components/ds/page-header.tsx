import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/*
 * Page title row. `sticky` keeps the title and primary actions visible while
 * long finance tables scroll (it bleeds to the edges of the main padding).
 */
export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  sticky = false,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  sticky?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between",
        sticky &&
          "sticky top-0 z-20 -mx-4 -mt-4 border-b border-transparent bg-background/85 px-4 pb-4 pt-4 backdrop-blur supports-[backdrop-filter]:bg-background/70 md:-mx-6 md:-mt-6 md:px-6 md:pt-6 lg:-mx-8 lg:-mt-8 lg:px-8 lg:pt-8",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">{eyebrow}</div>}
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
