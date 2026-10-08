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
  BellRing,
  Search,
  Menu,
  Text,
  Activity,
  Plus
} from "lucide-react";
import { useAuth } from "@workspace/replit-auth-web";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { NewTransactionProvider, useNewTransaction } from "@/components/new-transaction";
import { PageTransition } from "@/components/ds/page-transition";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { href: "/events", label: "Events", icon: CalendarDays },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/leads", label: "Leads & Pipeline", icon: Target },
  { href: "/marketing", label: "Marketing", icon: TrendingUp },
  { href: "/finance", label: "Finance", icon: Wallet },
  { href: "/finance/receivables", label: "Receivables", icon: ReceiptIndianRupee },
  { href: "/finance/expenses", label: "Expenses", icon: Receipt },
  { href: "/fund-transfers", label: "Funds", icon: ArrowUpDown },
  { href: "/notes", label: "Notes", icon: Text },
  { href: "/vendors", label: "Vendors", icon: Briefcase },
  { href: "/team", label: "Team", icon: Users2 },
  { href: "/reports", label: "Reports", icon: PieChart },
  { href: "/performance", label: "Performance", icon: Activity },
  { href: "/valuation", label: "Valuation Command", icon: Target, isGold: true },
];

const BOTTOM_NAV_ITEMS = [
  { href: "/settings", label: "Settings", icon: Settings },
];

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const [location] = useLocation();
  const { logout } = useAuth();

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="h-16 flex items-center gap-2.5 px-6 border-b shrink-0">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground" aria-hidden>A</span>
        <h1 className="text-base font-semibold tracking-[0.18em] text-foreground uppercase">Auron OS</h1>
      </div>
      <nav aria-label="Main" className="flex-1 overflow-y-auto py-4 px-3 flex flex-col gap-0.5">
        {NAV_ITEMS.map((item) => {
          const isActive = location === item.href || (location.startsWith(item.href) && item.href !== "/dashboard" && item.href !== "/finance");
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "group relative flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors duration-150",
                isActive
                  ? "bg-card text-foreground font-medium shadow-card"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
                item.isGold && !isActive && "text-primary/90 hover:text-primary"
              )}
            >
              {isActive && <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary" aria-hidden />}
              <item.icon className={cn("h-4 w-4 transition-colors", isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-3 border-t flex flex-col gap-1 shrink-0">
        {BOTTOM_NAV_ITEMS.map((item) => {
          const isActive = location === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                isActive
                  ? "bg-muted text-foreground font-medium"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
        <button
          onClick={logout}
          className="flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors text-muted-foreground hover:bg-muted/50 hover:text-foreground w-full text-left"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}

function AppHeader({ onMenuClick }: { onMenuClick: () => void }) {
  const newTransaction = useNewTransaction();
  return (
    <header className="h-16 border-b bg-card/80 backdrop-blur flex items-center justify-between px-4 md:px-6 shrink-0">
      <div className="flex items-center gap-4 flex-1">
        <button onClick={onMenuClick} className="md:hidden p-1 -ml-1 text-muted-foreground hover:text-foreground">
          <Menu className="h-5 w-5" />
        </button>
        <div className="relative w-64 max-w-md hidden md:block">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            type="search"
            placeholder="Search OS... (Cmd+K)"
            className="h-9 w-full rounded-md border border-input bg-transparent pl-9 pr-4 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring placeholder:text-muted-foreground"
          />
        </div>
      </div>
      <div className="flex items-center gap-2 sm:gap-4">
        <Button size="sm" onClick={() => newTransaction.open()} className="h-9">
          <Plus className="h-4 w-4 sm:mr-1.5" />
          <span className="hidden sm:inline">New Transaction</span>
          <span className="sr-only sm:hidden">New Transaction</span>
        </Button>
        <button className="relative p-2 text-muted-foreground hover:text-foreground transition-colors" aria-label="Notifications">
          <BellRing className="h-5 w-5" />
          <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-primary" />
        </button>
        <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center border border-border">
          <span className="text-sm font-medium">CEO</span>
        </div>
      </div>
    </header>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [location] = useLocation();

  return (
    <NewTransactionProvider>
    <div className="flex h-[100dvh] w-full bg-background overflow-hidden text-foreground">
      {/* Desktop sidebar - hidden on mobile */}
      <aside className="hidden md:flex w-64 border-r bg-sidebar flex-shrink-0 flex-col h-[100dvh] overflow-hidden">
        <SidebarContent />
      </aside>

      {/* Mobile drawer using Sheet */}
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent side="left" className="w-64 p-0 bg-sidebar border-r">
          <SidebarContent onNavigate={() => setMobileMenuOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <AppHeader onMenuClick={() => setMobileMenuOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          <PageTransition routeKey={location}>{children}</PageTransition>
        </main>
      </div>
    </div>
    </NewTransactionProvider>
  );
}
