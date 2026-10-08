import type { ReactNode } from "react";
import { Link } from "wouter";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/*
 * Phone layout for list pages: each table row becomes a tappable card with
 * a title, a secondary line, a headline amount and optional extra facts.
 * Tables stay as they are from md up.
 */
export function MobileList({ children, className }: { children: ReactNode; className?: string }) {
  return <ul className={cn("divide-y md:hidden", className)}>{children}</ul>;
}

export function MobileListItem({
  href,
  title,
  subtitle,
  value,
  badge,
  meta,
  actions,
}: {
  href?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  value?: ReactNode;
  badge?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  const body = (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 truncate font-medium">{title}</p>
          {value && <div className="shrink-0 text-sm font-medium tabular-nums">{value}</div>}
        </div>
        {(subtitle || badge) && (
          <div className="mt-1 flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span className="min-w-0 truncate">{subtitle}</span>
            {badge && <span className="shrink-0">{badge}</span>}
          </div>
        )}
        {meta && <div className="mt-2 text-xs text-muted-foreground">{meta}</div>}
      </div>
      {href && !actions && <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/60" aria-hidden />}
      {actions && <div className="-mr-2 -mt-1 flex shrink-0 items-center">{actions}</div>}
    </div>
  );
  return (
    <li>
      {href ? (
        <Link href={href} className="block px-4 py-3.5 transition-colors duration-150 active:bg-surface-2">
          {body}
        </Link>
      ) : (
        <div className="px-4 py-3.5">{body}</div>
      )}
    </li>
  );
}
