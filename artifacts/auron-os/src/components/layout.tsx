import { useState } from "react";
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
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { formatDistanceToNowStrict } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@workspace/replit-auth-web";
import { useListNotifications, useMarkAllNotificationsRead, getListNotificationsQueryKey } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { NewTransactionProvider, useNewTransaction } from "@/components/new-transaction";
import { PageTransition } from "@/components/ds/page-transition";

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

const ALL_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

function isActivePath(location: string, href: string): boolean {
  if (location === href) return true;
  // /finance and /dashboard only match exactly (other finance pages have their own items).
  if (href === "/dashboard" || href === "/finance") return false;
  return location.startsWith(`${href}/`);
}

function currentSection(location: string): string | null {
  return ALL_ITEMS.find((i) => isActivePath(location, i.href))?.label ?? null;
}

function SidebarContent({ onNavigate, layoutGroup }: { onNavigate?: () => void; layoutGroup: string }) {
  const [location] = useLocation();
  const { logout } = useAuth();
  const reduce = useReducedMotion();

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex h-16 shrink-0 items-center gap-2.5 border-b px-5">
        <span
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[hsl(44_60%_60%)] to-[hsl(40_55%_44%)] text-[13px] font-bold text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.35),0_1px_2px_rgb(28_22_12/0.2)]"
          aria-hidden
        >
          A
        </span>
        <div className="leading-tight">
          <p className="text-[13px] font-semibold uppercase tracking-[0.2em] text-foreground">Auron</p>
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Business OS</p>
        </div>
      </div>
      <nav aria-label="Main" className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">{group.label}</p>
            <div className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const isActive = isActivePath(location, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "group relative flex min-h-9 items-center gap-3 rounded-md px-3 py-1.5 text-sm transition-colors duration-150",
                      isActive ? "font-medium text-foreground" : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                      item.isGold && !isActive && "text-gold-ink hover:text-gold-ink",
                    )}
                  >
                    {isActive && (
                      <motion.span
                        layoutId={`${layoutGroup}-active`}
                        className="absolute inset-0 rounded-md border bg-card shadow-card"
                        transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 40 }}
                        aria-hidden
                      >
                        <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary" />
                      </motion.span>
                    )}
                    <item.icon
                      className={cn(
                        "relative h-4 w-4 transition-[color,transform] duration-150",
                        isActive ? "text-gold-ink" : item.isGold ? "text-gold-ink" : "text-muted-foreground group-hover:text-foreground",
                      )}
                    />
                    <span className="relative">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="flex shrink-0 flex-col gap-0.5 border-t p-3">
        <Link
          href="/settings"
          onClick={onNavigate}
          aria-current={location === "/settings" ? "page" : undefined}
          className={cn(
            "flex min-h-9 items-center gap-3 rounded-md px-3 py-1.5 text-sm transition-colors",
            location === "/settings" ? "bg-card font-medium text-foreground shadow-card" : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
          )}
        >
          <Settings className="h-4 w-4" />
          Settings
        </Link>
        <button
          type="button"
          onClick={logout}
          className="flex min-h-9 w-full items-center gap-3 rounded-md px-3 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </div>
  );
}

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
        <button
          type="button"
          className="relative flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        >
          <Bell className="h-[18px] w-[18px]" />
          {unread > 0 && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary ring-2 ring-card animate-in zoom-in-50" aria-hidden />}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
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
          <ul className="max-h-80 divide-y overflow-y-auto">
            {items.slice(0, 12).map((n) => (
              <li key={n.id} className={cn("px-4 py-3", !n.isRead && "bg-primary/[0.04]")}>
                <div className="flex items-start gap-2">
                  {!n.isRead && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
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

function AppHeader({ onMenuClick }: { onMenuClick: () => void }) {
  const newTransaction = useNewTransaction();
  const [location] = useLocation();
  const { user } = useAuth();
  const section = currentSection(location);
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.username || "";
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b bg-card/80 px-3 backdrop-blur supports-[backdrop-filter]:bg-card/70 sm:px-4 md:h-16 md:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <button
          type="button"
          onClick={onMenuClick}
          className="flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </button>
        {section && <p className="truncate text-sm font-medium text-muted-foreground">{section}</p>}
      </div>
      <div className="flex items-center gap-1.5 sm:gap-2">
        <Button size="sm" onClick={() => newTransaction.open()} className="h-9 px-3 sm:px-3.5">
          <Plus className="h-4 w-4 sm:mr-1.5" />
          <span className="hidden sm:inline">New Transaction</span>
          <span className="sr-only sm:hidden">New Transaction</span>
        </Button>
        <NotificationsButton />
        {initials && (
          <div
            className="flex h-8 w-8 items-center justify-center rounded-full border bg-surface-2 text-xs font-semibold text-foreground"
            title={name}
            aria-label={`Signed in as ${name}`}
          >
            {initials}
          </div>
        )}
      </div>
    </header>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [location] = useLocation();

  return (
    <NewTransactionProvider>
      <div className="flex h-[100dvh] w-full overflow-hidden bg-background text-foreground">
        {/* Desktop sidebar - hidden on mobile */}
        <aside className="hidden h-[100dvh] w-64 flex-shrink-0 flex-col overflow-hidden border-r bg-sidebar md:flex">
          <SidebarContent layoutGroup="desktop" />
        </aside>

        {/* Mobile drawer using Sheet */}
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetContent side="left" className="w-[18rem] max-w-[85vw] border-r bg-sidebar p-0">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <SidebarContent layoutGroup="mobile" onNavigate={() => setMobileMenuOpen(false)} />
          </SheetContent>
        </Sheet>

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <AppHeader onMenuClick={() => setMobileMenuOpen(true)} />
          <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
            <PageTransition routeKey={location}>{children}</PageTransition>
          </main>
        </div>
      </div>
    </NewTransactionProvider>
  );
}
