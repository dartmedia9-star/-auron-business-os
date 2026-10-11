import { useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  ArrowUpDown,
  BarChart3,
  Users,
  CalendarDays,
  Target,
  TrendingUp,
  Wallet,
  Receipt,
  ReceiptIndianRupee,
  Briefcase,
  Users2,
  PieChart,
  Settings,
  Bell,
  Menu,
  Text,
  Activity,
  Plus,
  LogOut,
  Gem,
  Calculator,
  SunMoon,
  ChevronRight,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { formatDistanceToNowStrict } from "date-fns";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@workspace/replit-auth-web";
import { useListNotifications, useMarkAllNotificationsRead, getListNotificationsQueryKey } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { NewTransactionProvider, useNewTransaction } from "@/components/new-transaction";
import { AppearanceControls } from "@/components/experience/appearance-controls";
import { MAIN_SCROLL_ID } from "@/components/ds/page-transition";
import { EASE_OUT, SPRING, springFor, useMotionProfile } from "@/lib/motion";

type NavItem = { href: string; label: string; icon: typeof BarChart3; isGold?: boolean };

const NAV_GROUPS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "Overview",
    items: [
      { href: "/dashboard", label: "Command Center", icon: BarChart3 },
      { href: "/performance", label: "Performance", icon: Activity },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/events", label: "Events", icon: CalendarDays },
      { href: "/clients", label: "Clients", icon: Users },
      { href: "/vendors", label: "Vendors", icon: Briefcase },
      { href: "/team", label: "Team", icon: Users2 },
      { href: "/notes", label: "Notes", icon: Text },
      { href: "/rate-calculator", label: "Rate Calculator", icon: Calculator },
    ],
  },
  {
    label: "Finance",
    items: [
      { href: "/finance", label: "Finance", icon: Wallet },
      { href: "/finance/receivables", label: "Receivables", icon: ReceiptIndianRupee },
      { href: "/finance/expenses", label: "Expenses", icon: Receipt },
      { href: "/fund-transfers", label: "Funds", icon: ArrowUpDown },
      { href: "/reports", label: "Reports", icon: PieChart },
    ],
  },
  {
    label: "Growth",
    items: [
      { href: "/leads", label: "Leads & Pipeline", icon: Target },
      { href: "/marketing", label: "Marketing", icon: TrendingUp },
      { href: "/valuation", label: "Valuation Command", icon: Gem, isGold: true },
    ],
  },
];

const SETTINGS_ITEM: NavItem = { href: "/settings", label: "Settings", icon: Settings };

function isActivePath(location: string, href: string): boolean {
  if (location === href) return true;
  // /finance and /dashboard only match exactly (other finance pages have their own items).
  if (href === "/dashboard" || href === "/finance") return false;
  return location.startsWith(`${href}/`);
}

function currentSection(location: string): { group: string; label: string } | null {
  for (const g of NAV_GROUPS) {
    const item = g.items.find((i) => isActivePath(location, i.href));
    if (item) return { group: g.label, label: item.label };
  }
  if (isActivePath(location, SETTINGS_ITEM.href)) return { group: "System", label: SETTINGS_ITEM.label };
  return null;
}

/*
 * One navigation row. The active row carries the shared selection pill
 * (a layoutId, so it glides between rows on a spring); the hovered row
 * carries a softer hover pill that follows the pointer the same way.
 */
function NavLink({
  item,
  active,
  hovered,
  layoutGroup,
  onHover,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  hovered: boolean;
  layoutGroup: string;
  onHover: (href: string | null) => void;
  onNavigate?: () => void;
}) {
  const profile = useMotionProfile();
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      onMouseEnter={() => onHover(item.href)}
      onFocus={() => onHover(item.href)}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex min-h-9 items-center gap-3 rounded-lg px-3 py-1.5 text-sm outline-none transition-[color,transform] duration-150 active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-ring",
        active ? "font-medium text-foreground" : "text-sidebar-foreground hover:text-foreground",
        item.isGold && !active && "text-gold-ink hover:text-gold-ink",
      )}
    >
      {hovered && !active && (
        <motion.span
          layoutId={`${layoutGroup}-hover`}
          className="absolute inset-0 rounded-lg bg-[hsl(var(--state-hover))]"
          transition={springFor(profile, SPRING.press)}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          aria-hidden
        />
      )}
      {active && (
        <motion.span
          layoutId={`${layoutGroup}-active`}
          className="absolute inset-0 rounded-lg border border-[hsl(var(--glass-border))] bg-[hsl(var(--state-selected))] shadow-[var(--glass-highlight)]"
          transition={springFor(profile)}
          aria-hidden
        >
          <span className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-gold shadow-[0_0_10px_hsl(var(--gold)/0.45)]" />
        </motion.span>
      )}
      <item.icon
        className={cn(
          "relative h-4 w-4 shrink-0 transition-[color,transform] duration-200 group-hover:scale-110",
          active || item.isGold ? "text-gold-ink" : "text-muted-foreground group-hover:text-foreground",
        )}
      />
      <span className="relative truncate">{item.label}</span>
    </Link>
  );
}

function SidebarContent({ onNavigate, layoutGroup, animateIn = false }: { onNavigate?: () => void; layoutGroup: string; animateIn?: boolean }) {
  const [location] = useLocation();
  const { logout } = useAuth();
  const profile = useMotionProfile();
  const [hovered, setHovered] = useState<string | null>(null);
  const reduce = profile.intensity === "reduced";

  // Drawer only: groups cascade in when it opens.
  const group = (i: number) =>
    animateIn && !reduce
      ? {
          initial: { opacity: 0, x: -12 * profile.distance },
          animate: { opacity: 1, x: 0 },
          transition: { duration: 0.32 * profile.scale, delay: 0.06 + i * 0.045, ease: EASE_OUT },
        }
      : {};

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex h-16 shrink-0 items-center gap-2.5 px-5">
        <span
          className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-gradient-to-br from-[hsl(44_70%_66%)] to-[hsl(38_58%_42%)] text-[13px] font-bold text-[hsl(226_42%_8%)] shadow-[inset_0_1px_0_rgb(255_255_255/0.45),0_4px_14px_-4px_hsl(var(--gold)/0.55)]"
          aria-hidden
        >
          A
        </span>
        <div className="leading-tight">
          <p className="text-[13px] font-semibold uppercase tracking-[0.2em] text-foreground">Auron</p>
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Business OS</p>
        </div>
      </div>
      <nav aria-label="Main" className="flex-1 space-y-5 overflow-y-auto px-3 pb-4 pt-2" onMouseLeave={() => setHovered(null)}>
        {NAV_GROUPS.map((g, i) => (
          <motion.div key={g.label} {...group(i)}>
            <p className="mb-1 px-3 text-eyebrow font-semibold uppercase text-muted-foreground/80">{g.label}</p>
            <div className="flex flex-col gap-0.5">
              {g.items.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  active={isActivePath(location, item.href)}
                  hovered={hovered === item.href}
                  layoutGroup={layoutGroup}
                  onHover={setHovered}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          </motion.div>
        ))}
      </nav>
      <div className="flex shrink-0 flex-col gap-0.5 border-t border-[hsl(var(--glass-border))] p-3" onMouseLeave={() => setHovered(null)}>
        <NavLink
          item={SETTINGS_ITEM}
          active={isActivePath(location, SETTINGS_ITEM.href)}
          hovered={hovered === SETTINGS_ITEM.href}
          layoutGroup={layoutGroup}
          onHover={setHovered}
          onNavigate={onNavigate}
        />
        <button
          type="button"
          onClick={logout}
          className="flex min-h-9 w-full items-center gap-3 rounded-lg px-3 py-1.5 text-left text-sm text-sidebar-foreground transition-colors state-layer hover:text-foreground active:scale-[0.985]"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </div>
  );
}

const headerIconButton =
  "relative flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-[color,background-color,transform] duration-150 hover:bg-[hsl(var(--state-hover))] hover:text-foreground active:scale-95 data-[state=open]:bg-[hsl(var(--state-selected))] data-[state=open]:text-foreground";

/* Bell with a dot only when there are unread notifications. */
function NotificationsButton() {
  const queryClient = useQueryClient();
  const { data } = useListNotifications(undefined, { query: { queryKey: getListNotificationsQueryKey(), staleTime: 60_000 } });
  const markAll = useMarkAllNotificationsRead();
  const items = data ?? [];
  const unread = items.filter((n) => !n.isRead).length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={headerIconButton} aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}>
          <Bell className="h-[18px] w-[18px]" />
          <AnimatePresence>
            {unread > 0 && (
              <motion.span
                key="dot"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                transition={SPRING.press}
                className="absolute right-2 top-2 h-2 w-2 rounded-full bg-gold ring-2 ring-background"
                aria-hidden
              />
            )}
          </AnimatePresence>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[min(22rem,calc(100vw-2rem))] overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-[hsl(var(--glass-border))] px-4 py-3">
          <p className="text-sm font-semibold">Notifications</p>
          {unread > 0 && (
            <button
              type="button"
              className="text-xs font-medium text-gold-ink hover:underline disabled:opacity-50"
              disabled={markAll.isPending}
              onClick={() =>
                markAll.mutate(undefined, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() }) })
              }
            >
              Mark all read
            </button>
          )}
        </div>
        {items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">You're all caught up.</p>
        ) : (
          <ul className="max-h-80 divide-y divide-[hsl(var(--glass-border))] overflow-y-auto">
            {items.slice(0, 12).map((n) => (
              <li key={n.id} className={cn("px-4 py-3", !n.isRead && "bg-[hsl(var(--state-selected))]")}>
                <div className="flex items-start gap-2">
                  {!n.isRead && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" aria-label="Unread" />}
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{n.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{n.message}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground/80">{formatDistanceToNowStrict(new Date(n.createdAt), { addSuffix: true })}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

/* Compact Appearance & Experience control; the full set lives in Settings. */
function AppearanceButton() {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={headerIconButton} aria-label="Appearance and experience">
          <SunMoon className="h-[18px] w-[18px]" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[min(22rem,calc(100vw-2rem))]">
        <p className="mb-3 text-sm font-semibold">Appearance &amp; Experience</p>
        <AppearanceControls compact />
        <Link
          href="/settings"
          onClick={() => setOpen(false)}
          className="mt-3 flex items-center justify-between rounded-lg px-2 py-2 text-xs font-medium text-muted-foreground transition-colors state-layer hover:text-foreground"
        >
          More options in Settings
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </PopoverContent>
    </Popover>
  );
}

/* Thin bar under the header while any data is loading; nothing when idle. */
function FetchingBar() {
  const fetching = useIsFetching() > 0;
  return (
    <AnimatePresence>
      {fetching && (
        <motion.div
          key="fetching"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { delay: 0.15 } }}
          exit={{ opacity: 0, transition: { duration: 0.3 } }}
          aria-hidden
        >
          <div className="h-full w-1/3 animate-[shimmer_1.1s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-blue to-transparent motion-reduce:hidden" />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function AppHeader({ onMenuClick }: { onMenuClick: () => void }) {
  const newTransaction = useNewTransaction();
  const [location] = useLocation();
  const { user } = useAuth();
  const profile = useMotionProfile();
  const section = currentSection(location);
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.username || "";
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  return (
    <header className="glass-fill relative z-30 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-[hsl(var(--glass-border))] px-3 sm:px-4 md:h-16 md:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <button
          type="button"
          onClick={onMenuClick}
          className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-[color,background-color,transform] hover:bg-[hsl(var(--state-hover))] hover:text-foreground active:scale-95 md:hidden"
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </button>
        {/* Section label slides to the new section on navigation. */}
        <div className="relative h-5 min-w-0 flex-1 overflow-hidden">
          <AnimatePresence mode="popLayout" initial={false}>
            {section && (
              <motion.p
                key={section.label}
                className="absolute inset-0 flex items-center gap-1.5 truncate text-sm"
                initial={profile.intensity === "reduced" ? false : { opacity: 0, y: 10 * profile.distance }}
                animate={{ opacity: 1, y: 0 }}
                exit={profile.intensity === "reduced" ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: -10 * profile.distance }}
                transition={{ duration: 0.24 * profile.scale, ease: EASE_OUT }}
              >
                <span className="hidden text-muted-foreground sm:inline">{section.group}</span>
                <ChevronRight className="hidden h-3.5 w-3.5 shrink-0 text-muted-foreground/60 sm:inline" aria-hidden />
                <span className="truncate font-medium text-foreground">{section.label}</span>
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </div>
      <div className="flex items-center gap-1 sm:gap-1.5">
        <Button size="sm" onClick={() => newTransaction.open()} className="mr-1 h-9 rounded-full px-3 shadow-[0_6px_18px_-8px_hsl(var(--gold)/0.7)] sm:px-4">
          <Plus className="h-4 w-4 sm:mr-1.5" />
          <span className="hidden sm:inline">New Transaction</span>
          <span className="sr-only sm:hidden">New Transaction</span>
        </Button>
        <AppearanceButton />
        <NotificationsButton />
        {initials && (
          <div
            className="ml-0.5 flex h-8 w-8 items-center justify-center rounded-full border border-[hsl(var(--glass-border))] bg-surface-3 text-xs font-semibold text-foreground"
            title={name}
            aria-label={`Signed in as ${name}`}
          >
            {initials}
          </div>
        )}
      </div>
      <FetchingBar />
    </header>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <NewTransactionProvider>
      <div className="ambient-canvas flex h-[100dvh] w-full overflow-hidden text-foreground">
        <a
          href={`#${MAIN_SCROLL_ID}`}
          className="sr-only z-50 rounded-lg bg-card px-3 py-2 text-sm font-medium focus:not-sr-only focus:absolute focus:left-3 focus:top-3"
        >
          Skip to content
        </a>

        {/* Desktop sidebar: a floating glass panel - hidden on mobile */}
        <aside className="hidden h-[100dvh] w-64 flex-shrink-0 p-3 pr-0 md:flex">
          <div className="glass flex w-full flex-col overflow-hidden rounded-3xl">
            <SidebarContent layoutGroup="desktop" />
          </div>
        </aside>

        {/* Mobile drawer using Sheet */}
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetContent side="left" className="w-[18rem] max-w-[85vw] border-0 bg-transparent p-2 shadow-none">
            <div className="glass-strong h-full overflow-hidden rounded-3xl">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <SidebarContent layoutGroup="mobile" animateIn onNavigate={() => setMobileMenuOpen(false)} />
            </div>
          </SheetContent>
        </Sheet>

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <AppHeader onMenuClick={() => setMobileMenuOpen(true)} />
          <main id={MAIN_SCROLL_ID} tabIndex={-1} className="flex-1 overflow-y-auto p-4 outline-none md:p-6 lg:p-8">
            {children}
          </main>
        </div>
      </div>
    </NewTransactionProvider>
  );
}
