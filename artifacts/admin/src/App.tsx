import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { AdminLayout } from "@/components/AdminLayout";
import LoginPage from "@/pages/Login";
import DashboardPage from "@/pages/Dashboard";
import UsersPage from "@/pages/Users";
import BillingPage from "@/pages/Billing";
import IntegrationsPage from "@/pages/Integrations";
import LogsPage from "@/pages/Logs";
import AuditLogsPage from "@/pages/AuditLogs";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, isLoading, logout } = useAdminAuth();
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground text-sm">Verifying session…</div>
      </div>
    );
  }
  if (!isAuthenticated) return <Redirect to="/login" />;
  return (
    <AdminLayout onLogout={logout}>
      <Component />
    </AdminLayout>
  );
}

function AuthRoute() {
  const { isAuthenticated, isLoading, login } = useAdminAuth();
  if (isLoading) return null;
  if (isAuthenticated) return <Redirect to="/dashboard" />;
  return <LoginPage onLogin={login} />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={AuthRoute} />
      <Route path="/dashboard">
        {() => <ProtectedRoute component={DashboardPage} />}
      </Route>
      <Route path="/users">
        {() => <ProtectedRoute component={UsersPage} />}
      </Route>
      <Route path="/billing">
        {() => <ProtectedRoute component={BillingPage} />}
      </Route>
      <Route path="/integrations">
        {() => <ProtectedRoute component={IntegrationsPage} />}
      </Route>
      <Route path="/logs">
        {() => <ProtectedRoute component={LogsPage} />}
      </Route>
      <Route path="/audit">
        {() => <ProtectedRoute component={AuditLogsPage} />}
      </Route>
      <Route path="/">
        {() => <Redirect to="/dashboard" />}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={BASE}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
