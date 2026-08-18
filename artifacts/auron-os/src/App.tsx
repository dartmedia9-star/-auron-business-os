import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, useLocation, Router as WouterRouter, Redirect } from 'wouter';
import { useAuth } from '@workspace/replit-auth-web';
import { AppShell } from '@/components/layout';

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
import ReportsList from '@/pages/reports/index';
import AssetsList from '@/pages/assets/index';

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

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-[#0a0a0a]">
        <div className="h-8 w-8 rounded-full border-2 border-[#C9A84C] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  return (
    <AppShell>
      <RoutedErrorBoundary>
        <Switch>
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
          <Route path="/vendors" component={VendorsList} />
          <Route path="/assets" component={AssetsList} />
          <Route path="/team" component={TeamList} />
          <Route path="/reports" component={ReportsList} />
          <Route path="/settings" component={SettingsPage} />
          <Route component={NotFound} />
        </Switch>
      </RoutedErrorBoundary>
    </AppShell>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <AuthenticatedApp />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
