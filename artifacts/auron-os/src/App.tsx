import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { lazy, Suspense } from 'react';
import { Route, Switch, Router as WouterRouter, Redirect, useRoute } from 'wouter';
import { useAuth } from '@workspace/replit-auth-web';
import { AppShell } from '@/components/layout';
import { RouteTransition } from '@/components/ds/page-transition';
import { ExperienceProvider } from '@/components/experience/experience-provider';

import NotFound from '@/pages/not-found';
import LoginScreen from '@/pages/login';
import Dashboard from '@/pages/dashboard';
import EventsList from '@/pages/events/index';
import EventDetail from '@/pages/events/detail';
import ClientsList from '@/pages/clients/index';
import ClientDetail from '@/pages/clients/detail';
import LeadsPipeline from '@/pages/leads/index';
import ValuationCommand from '@/pages/valuation/index';
import FinanceSummary from '@/pages/finance/index';
import ReceivablesList from '@/pages/finance/receivables';
import SettingsPage from '@/pages/settings';
import VendorsList from '@/pages/vendors/index';
import TeamList from '@/pages/team/index';
import MarketingList from '@/pages/marketing/index';
import ExpensesList from '@/pages/finance/expenses';
import FundTransfers from '@/pages/fund-transfers';
import NotesList from '@/pages/notes';
import ReportsList from '@/pages/reports/index';
import AssetsList from '@/pages/assets/index';
import PerformanceIndex from '@/pages/performance/index';
import PerformanceAnnual from '@/pages/performance/annual';
import PerformanceMonthly from '@/pages/performance/monthly';
import PerformanceRevenue from '@/pages/performance/revenue';
import PerformanceExpenses from '@/pages/performance/expenses';
import PerformanceProfitability from '@/pages/performance/profitability';
import PerformanceEvents from '@/pages/performance/events';
import PerformanceCashflow from '@/pages/performance/cashflow';
import PerformanceActivity from '@/pages/performance/activity';
import PerformanceEbitda from '@/pages/performance/ebitda';
import PerformanceNetProfit from '@/pages/performance/net-profit';
import RateCalculatorPage from '@/pages/rate-calculator/index';

// Design Studio pulls in three.js and the PDF writer, so it loads on demand.
const DesignStudioList = lazy(() => import('@/pages/design-studio/index'));
const DesignStudioEditor = lazy(() => import('@/pages/design-studio/editor'));

function PageSpinner() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center" role="status" aria-label="Loading">
      <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function AuthenticatedApp() {
  const { isAuthenticated, isLoading } = useAuth();
  const [inEditor] = useRoute('/design-studio/:id');

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center ambient-canvas">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  // The design editor is full screen, outside the app shell.
  if (inEditor) {
    return (
      <ErrorBoundary>
        <Suspense fallback={<PageSpinner />}>
          <Route path="/design-studio/:id" component={DesignStudioEditor} />
        </Suspense>
      </ErrorBoundary>
    );
  }

  return (
    <AppShell>
      <RouteTransition render={(location) => <AppRoutes location={location} />} />
    </AppShell>
  );
}

/* Routes for one location; RouteTransition keeps an outgoing page on its own location. */
function AppRoutes({ location }: { location: string }) {
  return (
    <ErrorBoundary resetKey={location}>
      <Switch location={location}>
        <Route path="/" component={() => <Redirect to="/dashboard" />} />
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/events" component={EventsList} />
        <Route path="/events/:id" component={EventDetail} />
        <Route path="/clients" component={ClientsList} />
        <Route path="/clients/:id" component={ClientDetail} />
        <Route path="/leads" component={LeadsPipeline} />
        <Route path="/marketing" component={MarketingList} />
        <Route path="/valuation" component={ValuationCommand} />
        <Route path="/finance" component={FinanceSummary} />
        <Route path="/finance/receivables" component={ReceivablesList} />
        <Route path="/finance/expenses" component={ExpensesList} />
        <Route path="/fund-transfers" component={FundTransfers} />
        <Route path="/notes" component={NotesList} />
        <Route path="/rate-calculator" component={RateCalculatorPage} />
        <Route path="/design-studio">
          <Suspense fallback={<PageSpinner />}>
            <DesignStudioList />
          </Suspense>
        </Route>
        <Route path="/vendors" component={VendorsList} />
        <Route path="/assets" component={AssetsList} />
        <Route path="/team" component={TeamList} />
        <Route path="/reports" component={ReportsList} />
        <Route path="/performance" component={PerformanceIndex} />
        <Route path="/performance/:year" component={PerformanceAnnual} />
        <Route path="/performance/:year/:month" component={PerformanceMonthly} />
        <Route path="/performance/:year/:month/revenue" component={PerformanceRevenue} />
        <Route path="/performance/:year/:month/expenses" component={PerformanceExpenses} />
        <Route path="/performance/:year/:month/profitability" component={PerformanceProfitability} />
        <Route path="/performance/:year/:month/events" component={PerformanceEvents} />
        <Route path="/performance/:year/:month/cashflow" component={PerformanceCashflow} />
        <Route path="/performance/:year/:month/activity" component={PerformanceActivity} />
        <Route path="/performance/:year/:month/ebitda" component={PerformanceEbitda} />
        <Route path="/performance/:year/:month/net-profit" component={PerformanceNetProfit} />
        <Route path="/settings" component={SettingsPage} />
        <Route component={NotFound} />
      </Switch>
    </ErrorBoundary>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ExperienceProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <AuthenticatedApp />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </ExperienceProvider>
    </QueryClientProvider>
  );
}

export default App;
