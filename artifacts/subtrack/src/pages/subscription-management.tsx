import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  CheckCircle2,
  AlertTriangle,
  CreditCard,
  ArrowRight,
  Clock,
  Sparkles,
  CircleSlash,
  RefreshCw,
  ExternalLink,
  CalendarDays,
  TrendingDown,
  Ban,
  Repeat2,
  Bell,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getBillingState,
  getBillingEventsFromApi,
  trackBillingEvent,
  type BillingState,
  type BillingEvent,
} from "@/lib/billing";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(n);
}

function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const EVENT_LABELS: Record<BillingEvent["type"], string> = {
  subscription_started: "Subscribed to SubTrack Pro",
  subscription_cancelled: "Subscription cancelled",
  billing_skipped: "Chose limited access",
  upgrade_clicked: "Clicked upgrade to Pro",
  upgrade_prompt_clicked: "Clicked upgrade prompt",
  subscription_page_viewed: "Viewed subscription page",
};

const EVENT_ICON: Record<BillingEvent["type"], typeof CheckCircle2> = {
  subscription_started: CheckCircle2,
  subscription_cancelled: Ban,
  billing_skipped: CircleSlash,
  upgrade_clicked: Sparkles,
  upgrade_prompt_clicked: Sparkles,
  subscription_page_viewed: CreditCard,
};

const EVENT_COLOR: Record<BillingEvent["type"], string> = {
  subscription_started: "bg-green-100 border-green-200 text-green-700",
  subscription_cancelled: "bg-red-100 border-red-200 text-red-700",
  billing_skipped: "bg-amber-100 border-amber-200 text-amber-700",
  upgrade_clicked: "bg-primary/10 border-primary/20 text-primary",
  upgrade_prompt_clicked: "bg-primary/10 border-primary/20 text-primary",
  subscription_page_viewed: "bg-muted border-border text-muted-foreground",
};

// ── API billing details ───────────────────────────────────────────────────────

interface ApiBillingStatus {
  subscriptionStatus: string | null;
  subscriptionPlan: string | null;
  billingProvider: string | null;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function HistoryTimelineSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-start gap-3">
          <Skeleton className="h-7 w-7 rounded-full shrink-0 mt-0.5" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

function HistoryTimeline({
  events,
  loading,
}: {
  events: BillingEvent[];
  loading: boolean;
}) {
  if (loading) return <HistoryTimelineSkeleton />;

  if (events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic text-center py-4">
        No billing activity yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {events.slice(0, 20).map((ev, i) => {
        const Icon = EVENT_ICON[ev.type] ?? Clock;
        const colorClass = EVENT_COLOR[ev.type] ?? "bg-muted border-border text-muted-foreground";
        return (
          <div key={i} className="flex items-start gap-3">
            <div
              className={`h-7 w-7 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${colorClass}`}
            >
              <Icon className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground leading-snug">
                {ev.label || EVENT_LABELS[ev.type] || ev.type}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{fmtDate(ev.timestamp)}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── States ────────────────────────────────────────────────────────────────────

function SubscribedState({
  apiStatus,
  events,
  eventsLoading,
}: {
  apiStatus: ApiBillingStatus | null;
  events: BillingEvent[];
  eventsLoading: boolean;
}) {
  const [cancelConfirm, setCancelConfirm] = useState(false);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Status card */}
      <Card className="border-green-200/70 bg-gradient-to-br from-green-50/60 to-background shadow-sm overflow-hidden">
        <CardContent className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="h-11 w-11 rounded-full bg-green-100 border-2 border-green-200 flex items-center justify-center shrink-0">
                <CheckCircle2 className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-base font-bold text-foreground">SubTrack Pro</p>
                  <Badge className="bg-green-100 text-green-800 border border-green-200 font-medium text-[11px]">
                    Active
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {fmt(4)} / month · continuous monitoring
                </p>
                {apiStatus?.billingProvider && (
                  <p className="text-xs text-muted-foreground/70 mt-1 capitalize">
                    via {apiStatus.billingProvider}
                  </p>
                )}
              </div>
            </div>
            <span className="relative flex h-3 w-3 shrink-0 mt-1">
              <span className="absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75 animate-ping" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-green-500" />
            </span>
          </div>
        </CardContent>
      </Card>

      {/* What's included */}
      <Card className="shadow-sm border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            What's included
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-2.5">
          {[
            { Icon: Repeat2, label: "Automatic subscription detection from bank & email" },
            { Icon: Ban, label: "Cancellation tracking & assistance" },
            { Icon: TrendingDown, label: "Savings monitoring & wasteful spend alerts" },
            { Icon: Bell, label: "Real-time renewal notifications" },
          ].map(({ Icon, label }) => (
            <div key={label} className="flex items-center gap-2.5">
              <div className="h-6 w-6 rounded bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                <Icon className="h-3.5 w-3.5 text-primary" />
              </div>
              <span className="text-sm text-foreground">{label}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Actions */}
      <Card className="shadow-sm border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Manage subscription
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-2.5">
          <Button
            variant="outline"
            className="w-full justify-start gap-2.5 h-11"
            onClick={() => {
              trackBillingEvent("subscription_page_viewed", "Clicked manage subscription");
            }}
          >
            <ExternalLink className="h-4 w-4 text-muted-foreground" />
            Manage subscription
            <span className="ml-auto text-xs text-muted-foreground">Coming soon</span>
          </Button>

          <Button
            variant="outline"
            className="w-full justify-start gap-2.5 h-11"
            onClick={() => {
              trackBillingEvent("subscription_page_viewed", "Clicked view billing history");
            }}
          >
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            View billing history
            <span className="ml-auto text-xs text-muted-foreground">Timeline below</span>
          </Button>

          {!cancelConfirm ? (
            <Button
              variant="outline"
              className="w-full justify-start gap-2.5 h-11 text-destructive border-destructive/30 hover:bg-destructive/5"
              onClick={() => setCancelConfirm(true)}
            >
              <CircleSlash className="h-4 w-4" />
              Cancel subscription
            </Button>
          ) : (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
              <p className="text-sm font-medium text-destructive">
                Are you sure you want to cancel?
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                You'll lose access to continuous monitoring, renewal alerts, and cancellation
                assistance. Your data is kept for 30 days.
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  className="flex-1"
                  onClick={() => {
                    trackBillingEvent(
                      "subscription_cancelled",
                      "Requested subscription cancellation",
                    );
                    setCancelConfirm(false);
                  }}
                >
                  Yes, cancel
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setCancelConfirm(false)}
                >
                  Keep subscription
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* History */}
      <Card className="shadow-sm border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <Clock className="h-3.5 w-3.5" />
            Billing history
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <HistoryTimeline events={events} loading={eventsLoading} />
        </CardContent>
      </Card>
    </div>
  );
}

function SkippedState({
  events,
  eventsLoading,
}: {
  events: BillingEvent[];
  eventsLoading: boolean;
}) {
  const [, setLocation] = useLocation();

  const handleUpgradeClick = () => {
    trackBillingEvent("upgrade_clicked", "Clicked upgrade from subscription page");
    setLocation("/onboarding?step=checkout");
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Status card */}
      <Card className="border-amber-200/70 bg-gradient-to-br from-amber-50/40 to-background shadow-sm overflow-hidden">
        <CardContent className="p-6">
          <div className="flex items-start gap-3">
            <div className="h-11 w-11 rounded-full bg-amber-100 border-2 border-amber-200 flex items-center justify-center shrink-0">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-base font-bold text-foreground">Limited Access</p>
                <Badge className="bg-amber-100 text-amber-800 border border-amber-200 font-medium text-[11px]">
                  Free plan
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                You chose to skip the Pro subscription during setup. You're on limited access —
                some features are disabled.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Feature comparison */}
      <Card className="shadow-sm border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            What you're missing
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-2.5">
          {[
            { Icon: Repeat2, label: "Continuous subscription monitoring", locked: true },
            { Icon: Ban, label: "Cancellation tracking & assistance", locked: true },
            { Icon: TrendingDown, label: "Automated savings insights & analysis", locked: true },
            { Icon: Bell, label: "Real-time renewal notifications", locked: true },
          ].map(({ Icon, label, locked }) => (
            <div key={label} className={`flex items-center gap-2.5 ${locked ? "opacity-60" : ""}`}>
              <div className="h-6 w-6 rounded bg-muted border border-border flex items-center justify-center shrink-0">
                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <span className="text-sm text-foreground line-through decoration-muted-foreground/50">
                {label}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Upgrade CTA */}
      <Card className="border-primary/25 bg-gradient-to-br from-primary/5 to-background shadow-md overflow-hidden">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <p className="text-sm font-bold text-foreground">Upgrade to SubTrack Pro</p>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Get continuous monitoring, savings alerts, and cancellation assistance for{" "}
            <span className="font-semibold text-foreground">{fmt(4)}/month</span>. Cancel anytime,
            no contracts.
          </p>
          <Button
            className="w-full h-12 font-semibold shadow-sm shadow-primary/20"
            onClick={handleUpgradeClick}
          >
            Upgrade to Pro — {fmt(4)}/month
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </CardContent>
      </Card>

      {/* History */}
      <Card className="shadow-sm border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <Clock className="h-3.5 w-3.5" />
            Activity history
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <HistoryTimeline events={events} loading={eventsLoading} />
        </CardContent>
      </Card>
    </div>
  );
}

function NoneState() {
  const [, setLocation] = useLocation();
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <Card className="border-border/60 shadow-sm">
        <CardContent className="p-8 text-center space-y-4">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-muted border border-border mx-auto">
            <CreditCard className="h-7 w-7 text-muted-foreground" />
          </div>
          <div>
            <p className="text-base font-bold text-foreground">No active subscription</p>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed max-w-xs mx-auto">
              You haven't completed your billing setup yet. Continue to choose your plan.
            </p>
          </div>
          <Button
            className="w-full max-w-xs h-11 font-semibold"
            onClick={() => setLocation("/onboarding?step=checkout")}
          >
            Continue setup
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SubscriptionManagement() {
  const [billingState, setBillingState] = useState<BillingState>(() => getBillingState());
  const [apiStatus, setApiStatus] = useState<ApiBillingStatus | null>(null);
  const [apiLoading, setApiLoading] = useState(true);

  // API-backed events — null = still loading, [] = loaded with no events
  const [events, setEvents] = useState<BillingEvent[] | null>(null);
  const eventsLoading = events === null;

  useEffect(() => {
    // Track page view (fire-and-forget)
    trackBillingEvent("subscription_page_viewed", "Viewed subscription management page");

    const token = localStorage.getItem("subtrack_token");
    if (!token) {
      setApiLoading(false);
      setEvents([]);
      return;
    }

    // Fetch billing status and events concurrently
    const statusPromise = fetch("/api/billing/status", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? (r.json() as Promise<ApiBillingStatus>) : null))
      .then((data) => {
        if (data) setApiStatus(data);
        if (data?.subscriptionStatus === "active") {
          setBillingState("subscribed");
        } else if (localStorage.getItem("subtrack_billing_skipped") === "1") {
          setBillingState("skipped");
        } else {
          setBillingState("none");
        }
      })
      .catch(() => {
        // Keep localStorage state on error
      })
      .finally(() => setApiLoading(false));

    const eventsPromise = getBillingEventsFromApi().then(setEvents);

    void Promise.all([statusPromise, eventsPromise]);
  }, []);

  const resolvedState = apiLoading ? getBillingState() : billingState;

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Page header */}
      <div className="space-y-1">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Subscription</h2>
        <p className="text-sm text-muted-foreground">
          Manage your SubTrack plan and view billing activity.
        </p>
      </div>

      {/* Status indicator */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <RefreshCw className={`h-3 w-3 ${apiLoading ? "animate-spin" : ""}`} />
        <span>
          {apiLoading
            ? "Checking subscription status…"
            : resolvedState === "subscribed"
              ? "Subscription verified from server"
              : "Status loaded"}
        </span>
      </div>

      {/* Content by state */}
      {resolvedState === "subscribed" && (
        <SubscribedState
          apiStatus={apiStatus}
          events={events ?? []}
          eventsLoading={eventsLoading}
        />
      )}
      {resolvedState === "skipped" && (
        <SkippedState events={events ?? []} eventsLoading={eventsLoading} />
      )}
      {(resolvedState === "none" || resolvedState === "loading") && <NoneState />}
    </div>
  );
}
