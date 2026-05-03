import "@/lib/migrate-storage";
import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, Redirect, useLocation } from "wouter";
import { QueryClient, QueryClientProvider, QueryCache } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// Pages
import Login from "@/pages/login";
import Register from "@/pages/register";
import ForgotPassword from "@/pages/forgot-password";
import ResetPassword from "@/pages/reset-password";
import Onboarding from "@/pages/onboarding";
import Dashboard from "@/pages/dashboard";
import Subscriptions from "@/pages/subscriptions";
import SubscriptionDetail from "@/pages/subscription-detail";
import BankAccounts from "@/pages/bank-accounts";
import Transactions from "@/pages/transactions";
import Cancellations from "@/pages/cancellations";
import Savings from "@/pages/savings";
import Notifications from "@/pages/notifications";
import Settings from "@/pages/settings";
import BillingSuccess from "@/pages/billing-success";
import BillingDemoCheckout from "@/pages/billing-demo-checkout";
import SubscriptionManagement from "@/pages/subscription-management";
import NotFound from "@/pages/not-found";

// Global 401 handler: any API query that returns 401 clears the token,
// which triggers useAuth to update isAuthenticated → AppLayout redirects to /login.
const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error: unknown) => {
      const status = (error as any)?.status ?? (error as any)?.statusCode ?? (error as any)?.response?.status;
      if (status === 401) {
        localStorage.removeItem("recuris_token");
        window.dispatchEvent(new Event("storage"));
      }
    },
  }),
  defaultOptions: {
    queries: {
      retry: (failureCount, error: unknown) => {
        const status = (error as any)?.status ?? (error as any)?.statusCode;
        if (status === 401 || status === 403) return false;
        return failureCount < 2;
      },
    },
  },
});

// Handles OAuth callback redirect: /?token=...&google_login=true
function OAuthRedirectHandler() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    const googleLogin = params.get("google_login");
    const googleLinked = params.get("google_linked");
    const error = params.get("error");

    if (token) {
      localStorage.setItem("recuris_token", token);
      window.dispatchEvent(new Event("storage"));
    }
    if (token || googleLogin || googleLinked || error) {
      window.history.replaceState({}, "", window.location.pathname);
      const fromOnboarding = sessionStorage.getItem("recuris_from_onboarding");
      if (fromOnboarding && (googleLinked || googleLogin)) {
        sessionStorage.removeItem("recuris_from_onboarding");
        setLocation("/onboarding?step=syncing-gmail");
      } else {
        setLocation("/dashboard");
      }
    }
  }, [setLocation]);
  return null;
}

// Protected route — wraps page in AppLayout (which handles auth redirect)
const ProtectedRoute = ({ component: Component, ...rest }: any) => {
  return (
    <Route {...rest}>
      {(params) => (
        <AppLayout>
          <Component params={params} />
        </AppLayout>
      )}
    </Route>
  );
};

function Router() {
  return (
    <>
      <OAuthRedirectHandler />
      <Switch>
        <Route path="/">
          <Redirect to="/dashboard" />
        </Route>
        <Route path="/login" component={Login} />
        <Route path="/register" component={Register} />
        <Route path="/forgot-password" component={ForgotPassword} />
        <Route path="/reset-password" component={ResetPassword} />
        <Route path="/onboarding" component={Onboarding} />

        <ProtectedRoute path="/dashboard" component={Dashboard} />
        <ProtectedRoute path="/subscriptions" component={Subscriptions} />
        <ProtectedRoute path="/subscriptions/:id" component={SubscriptionDetail} />
        <ProtectedRoute path="/bank-accounts" component={BankAccounts} />
        <ProtectedRoute path="/transactions" component={Transactions} />
        <ProtectedRoute path="/cancellations" component={Cancellations} />
        <ProtectedRoute path="/savings" component={Savings} />
        <ProtectedRoute path="/notifications" component={Notifications} />
        <ProtectedRoute path="/settings" component={Settings} />
        <ProtectedRoute path="/subscription" component={SubscriptionManagement} />
        <Route path="/billing/success" component={BillingSuccess} />
        <Route path="/billing/demo-checkout" component={BillingDemoCheckout} />

        <Route>
          <AppLayout>
            <NotFound />
          </AppLayout>
        </Route>
      </Switch>
    </>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
