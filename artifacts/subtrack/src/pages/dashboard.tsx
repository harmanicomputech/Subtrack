import { useState, useEffect } from "react";
import { getBillingState, isProFeatureAllowed, trackBillingEvent } from "@/lib/billing";
import {
  useGetDashboardSummary,
  useGetUpcomingRenewals,
  useGetSpendByCategory,
  useListNotifications,
  useListSubscriptions,
  useAnalyzeSubscriptions,
  getListSubscriptionsQueryKey,
} from "@workspace/api-client-react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { format, parseISO } from "date-fns";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend } from "recharts";
import {
  CreditCard, Ban, PiggyBank, Bell, AlertTriangle, ArrowRight, Landmark,
  Mail, CheckCircle2, Sparkles, TrendingDown, TrendingUp, Beaker, HelpCircle, RefreshCw,
  X, Activity, Clock, Zap, Loader2, Lock,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { GmailCard } from "@/components/GmailCard";
import { useToast } from "@/hooks/use-toast";

function toMonthly(sub: { amount: string | number; billingCycle?: string | null }): number {
  const amt = Number(sub.amount);
  const cycle = (sub.billingCycle ?? "monthly").toLowerCase();
  if (cycle === "annual" || cycle === "yearly") return amt / 12;
  if (cycle === "weekly") return amt * 4.33;
  return amt;
}

const COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
];

export default function Dashboard() {
  const { data: summary, isLoading: loadingSummary } = useGetDashboardSummary();
  const { data: upcoming, isLoading: loadingUpcoming } = useGetUpcomingRenewals();
  const { data: categories, isLoading: loadingCategories } = useGetSpendByCategory();
  const { data: notifications } = useListNotifications();
  const { data: allSubscriptions } = useListSubscriptions();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [lastAnalysis, setLastAnalysis] = useState<{
    unused: number; trial: number; uncertain: number; potentialMonthlySaving: number;
  } | null>(null);
  const [, setLocation] = useLocation();
  const [whyOpen, setWhyOpen] = useState(false);
  const [showFirstRunBanner, setShowFirstRunBanner] = useState(false);
  const [showAnalysisGate, setShowAnalysisGate] = useState(false);

  // Billing mode — initialised via centralised getBillingState() for zero-flash.
  // "loading"    = no localStorage flag yet, API check in progress
  // "subscribed" = active Pro subscription confirmed
  // "skipped"    = user chose free/limited mode
  // "none"       = no decision → will redirect to checkout
  type BillingMode = "loading" | "subscribed" | "skipped" | "none";
  const [billingMode, setBillingMode] = useState<BillingMode>(() => getBillingState());

  useEffect(() => {
    const fromOnboarding = localStorage.getItem("recuris_onboarding_done") === "1"
      && !localStorage.getItem("recuris_firstrun_dismissed");
    setShowFirstRunBanner(fromOnboarding);
  }, []);

  // Verify billing status from API on mount; enforces checkout redirect if no decision made.
  useEffect(() => {
    const token = localStorage.getItem("recuris_token");
    if (!token) {
      setBillingMode(m => m === "loading" ? "none" : m);
      return;
    }
    fetch("/api/billing/status", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.subscriptionStatus === "active") {
          localStorage.setItem("recuris_subscribed", "1");
          localStorage.removeItem("recuris_billing_skipped");
          setBillingMode("subscribed");
        } else {
          localStorage.removeItem("recuris_subscribed");
          const skipped = localStorage.getItem("recuris_billing_skipped") === "1";
          setBillingMode(skipped ? "skipped" : "none");
        }
      })
      .catch(() => {
        setBillingMode(m => m === "loading" ? "none" : m);
      });
  }, []);

  // Enforcement: redirect to checkout if no billing decision has been made.
  useEffect(() => {
    if (billingMode !== "none") return;
    console.log("dashboard_enforcement: no billing decision, redirecting to checkout");
    setLocation("/onboarding?step=checkout");
  }, [billingMode, setLocation]);

  const dismissFirstRunBanner = () => {
    localStorage.setItem("recuris_firstrun_dismissed", "1");
    setShowFirstRunBanner(false);
  };

  const analyzeMutation = useAnalyzeSubscriptions();

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount);

  const chartData = categories?.map(c => ({
    name: c.category || 'Uncategorized',
    value: c.amount
  })) || [];

  const unreadNotifications = notifications?.filter(n => !n.isRead) || [];

  // Source insight stats
  const activeSubs = allSubscriptions?.filter(s => s.status === "active") || [];
  const bothSourceCount = activeSubs.filter(s => {
    const srcs: string[] = Array.isArray((s as any).sources) ? (s as any).sources : [s.source ?? "bank"];
    return srcs.includes("bank") && srcs.includes("email");
  }).length;
  const emailOnlyCount = activeSubs.filter(s => {
    const srcs: string[] = Array.isArray((s as any).sources) ? (s as any).sources : [s.source ?? "bank"];
    return srcs.includes("email") && !srcs.includes("bank");
  }).length;
  const showSourceInsight = bothSourceCount > 0 || emailOnlyCount > 0;

  // Usage insight stats from subscription list
  const unusedCount = activeSubs.filter(s => (s as any).usageStatus === "unused").length;
  const trialCount = activeSubs.filter(s => (s as any).usageStatus === "trial").length;
  const uncertainCount = activeSubs.filter(s => (s as any).usageStatus === "uncertain").length;
  const totalFlagged = unusedCount + trialCount + uncertainCount;
  const showUsageInsight = totalFlagged > 0 || lastAnalysis !== null;

  const billingSkipped = billingMode === "skipped";

  const handleAnalyze = () => {
    analyzeMutation.mutate(undefined, {
      onSuccess: (data) => {
        setLastAnalysis(data);
        queryClient.invalidateQueries({ queryKey: getListSubscriptionsQueryKey() });
        const total = data.unused + data.trial + data.uncertain;
        toast({
          title: total > 0 ? "Savings found!" : "All subscriptions look active",
          description: total > 0
            ? `${total} subscription${total !== 1 ? "s" : ""} flagged. You could save up to ${formatCurrency(data.potentialMonthlySaving)}/month.`
            : "No unused or trial subscriptions detected.",
        });
      },
      onError: () => toast({ variant: "destructive", title: "Analysis failed" }),
    });
  };

  if (billingMode === "none") return null;
  if (billingMode === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">

      {/* ── FIRST-RUN VALUE ESCALATION BANNER ────────────────────────────── */}
      {showFirstRunBanner && (
        <div className="rounded-xl border border-primary/25 bg-gradient-to-br from-primary/6 to-background p-5 relative animate-in fade-in slide-in-from-top-2 duration-500">
          <button
            onClick={dismissFirstRunBanner}
            className="absolute top-3.5 right-3.5 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>

          {/* Header row */}
          <div className="flex items-center gap-2.5 mb-4">
            <div className="relative shrink-0">
              <div className="h-9 w-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Activity className="h-4.5 w-4.5 text-primary" />
              </div>
              <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75 animate-ping" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-green-500 border-2 border-background" />
              </span>
            </div>
            <div>
              <p className="text-sm font-bold text-foreground leading-tight">Your savings tracker is now active</p>
              <p className="text-xs text-muted-foreground">We're continuously monitoring your subscriptions</p>
            </div>
          </div>

          {/* Three forward-looking insight rows */}
          <div className="space-y-2.5 mb-4">
            {(() => {
              const now = new Date();
              const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
              const activeSubs = allSubscriptions?.filter(s => s.status === "active") ?? [];
              const renewalCount = activeSubs.filter(s => {
                if (!s.nextRenewalDate) return false;
                const d = new Date(s.nextRenewalDate);
                return d >= now && d <= in7Days;
              }).length;
              return (
                <>
                  <div className="flex items-start gap-2.5">
                    <div className="h-6 w-6 rounded bg-amber-100 border border-amber-200 flex items-center justify-center shrink-0 mt-0.5">
                      <Clock className="h-3.5 w-3.5 text-amber-700" />
                    </div>
                    <p className="text-xs text-foreground leading-snug">
                      <span className="font-semibold">Next 7 days:</span>{" "}
                      <span className="text-muted-foreground">
                        {renewalCount > 0
                          ? `${renewalCount} renewal${renewalCount !== 1 ? "s" : ""} require${renewalCount === 1 ? "s" : ""} attention`
                          : "no immediate renewals — we'll alert you when one is approaching"}
                      </span>
                    </p>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <div className="h-6 w-6 rounded bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                      <Zap className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <p className="text-xs text-foreground leading-snug">
                      <span className="font-semibold">Next 30 days:</span>{" "}
                      <span className="text-muted-foreground">potential additional savings opportunities will appear as we analyse usage patterns</span>
                    </p>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <div className="h-6 w-6 rounded bg-green-100 border border-green-200 flex items-center justify-center shrink-0 mt-0.5">
                      <Sparkles className="h-3.5 w-3.5 text-green-700" />
                    </div>
                    <p className="text-xs text-foreground leading-snug">
                      <span className="font-semibold">Ongoing:</span>{" "}
                      <span className="text-muted-foreground">we'll detect new subscriptions automatically as they appear in your accounts</span>
                    </p>
                  </div>
                </>
              );
            })()}
          </div>

          {/* Locked potential line */}
          <p className="text-[11px] text-muted-foreground border-t border-border/50 pt-3">
            Some savings opportunities only appear over time as we build a fuller picture of your usage patterns.
          </p>
        </div>
      )}

      {/* ── UPGRADE BANNER (free / limited mode) ─────────────────────────── */}
      {billingSkipped && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-primary/25 bg-primary/5 px-5 py-4 animate-in fade-in slide-in-from-top-2 duration-500">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">You're on Recuris Free</p>
              <p className="text-xs text-muted-foreground leading-snug">Upgrade for continuous monitoring, renewal alerts, and cancellation assistance.</p>
            </div>
          </div>
          <Button
            size="sm"
            className="shrink-0"
            onClick={() => setLocation("/onboarding?step=checkout")}
          >
            Upgrade — £4/mo
          </Button>
        </div>
      )}

      <div>
        <h2 className="text-3xl font-bold tracking-tight">Overview</h2>
        <p className="text-muted-foreground mt-1">Your financial co-pilot's view of your subscriptions.</p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="shadow-sm border-muted">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Monthly Spend</CardTitle>
            <CreditCard className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loadingSummary ? <Skeleton className="h-8 w-[100px]" /> : (
              <div className="text-2xl font-bold text-foreground">
                {formatCurrency(summary?.totalMonthlySpend || 0)}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">Active subscriptions only</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-muted">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Yearly Projection</CardTitle>
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loadingSummary ? <Skeleton className="h-8 w-[100px]" /> : (
              <div className="text-2xl font-bold text-foreground">
                {formatCurrency(summary?.totalYearlySpend || 0)}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">Estimated annual cost</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-muted bg-primary/5">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-primary">Total Saved</CardTitle>
            <PiggyBank className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            {loadingSummary ? <Skeleton className="h-8 w-[100px]" /> : (
              <div className="text-2xl font-bold text-primary">
                {formatCurrency(summary?.totalSaved || 0)}
              </div>
            )}
            <p className="text-xs text-primary/70 mt-1">From {summary?.cancelledSubscriptions || 0} cancellations</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-muted">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Subs</CardTitle>
            <CreditCard className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loadingSummary ? <Skeleton className="h-8 w-[50px]" /> : (
              <div className="text-2xl font-bold text-foreground">
                {summary?.activeSubscriptions || 0}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">Currently tracking</p>
          </CardContent>
        </Card>
      </div>

      {/* Get Started card — shown to new users with no subscriptions yet */}
      {!loadingSummary && (summary?.activeSubscriptions ?? 0) === 0 && (
        <Card className="shadow-sm border-primary/20 bg-gradient-to-br from-primary/5 to-background">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Landmark className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-base font-semibold text-foreground">Connect a bank account to get started</p>
                <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                  Recuris will automatically scan your transactions and detect all your recurring subscriptions — no manual entry needed.
                </p>
                <div className="flex flex-wrap gap-2 mt-4">
                  <Button size="sm" asChild>
                    <Link href="/bank-accounts">Connect Bank</Link>
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <Link href="/settings">Connect Gmail instead</Link>
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Gmail Integration Card */}
      <GmailCard />

      {/* Smart Insights Engine CTA + Results ─────────────────────────────── */}
      <Card className="shadow-sm border-orange-200/60 bg-gradient-to-br from-orange-50/60 to-amber-50/30 overflow-hidden relative">
        <div className="absolute top-0 right-0 w-40 h-40 opacity-5 pointer-events-none flex items-center justify-center">
          <Sparkles className="w-36 h-36 text-orange-500" />
        </div>
        <CardHeader className="pb-3 relative z-10">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-orange-500" /> Smart Insights
              </CardTitle>
              <CardDescription className="mt-1">
                Detect unused subscriptions and find potential savings with one tap.
              </CardDescription>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="border-orange-200 text-orange-700 bg-white hover:bg-orange-50 shrink-0"
              onClick={() => {
                if (!isProFeatureAllowed()) {
                  trackBillingEvent("upgrade_prompt_clicked", "from_analysis_button");
                  setShowAnalysisGate(g => !g);
                  return;
                }
                handleAnalyze();
              }}
              disabled={analyzeMutation.isPending}
            >
              <RefreshCw className={`mr-2 h-3.5 w-3.5 ${analyzeMutation.isPending ? "animate-spin" : ""}`} />
              {analyzeMutation.isPending ? "Analysing…" : "Run Analysis"}
            </Button>
          </div>
        </CardHeader>

        {/* Inline upgrade gate — shown when a limited user clicks Run Analysis */}
        {showAnalysisGate && billingSkipped && (
          <div className="mx-6 mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 flex items-start justify-between gap-4 animate-in slide-in-from-top-1 duration-300">
            <div className="flex items-start gap-2.5 min-w-0">
              <Lock className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-900">Upgrade to Pro to run analysis</p>
                <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
                  Smart Insights — unused detection, trial flagging, and savings estimates — are Pro features.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              className="shrink-0 h-8 text-xs"
              onClick={() => setLocation("/onboarding?step=checkout")}
            >
              Upgrade — £4/mo
            </Button>
          </div>
        )}

        <CardContent className="relative z-10">
          {showUsageInsight ? (
            <div className="space-y-3">
              {/* Savings call-out */}
              {(lastAnalysis?.potentialMonthlySaving ?? 0) > 0 && (
                <div className="flex items-center gap-3 bg-white border border-orange-200 rounded-lg p-3">
                  <div className="h-9 w-9 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                    <TrendingDown className="h-4 w-4 text-orange-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-orange-900">
                      Save up to {formatCurrency(lastAnalysis!.potentialMonthlySaving)}/month
                    </p>
                    <p className="text-xs text-orange-600">by cancelling unused subscriptions</p>
                  </div>
                  <Button size="sm" variant="ghost" className="text-orange-700 hover:bg-orange-50 shrink-0" asChild>
                    <Link href="/subscriptions">Review <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link>
                  </Button>
                </div>
              )}

              {/* Insight chips */}
              <div className="flex flex-wrap gap-2">
                {unusedCount > 0 && (
                  <Link href="/subscriptions">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-orange-100 text-orange-700 border border-orange-200 px-2.5 py-1.5 rounded-full cursor-pointer hover:bg-orange-200 transition-colors">
                      <AlertTriangle className="h-3 w-3" />
                      {unusedCount} may be unused
                    </span>
                  </Link>
                )}
                {trialCount > 0 && (
                  <Link href="/subscriptions">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-sky-100 text-sky-700 border border-sky-200 px-2.5 py-1.5 rounded-full cursor-pointer hover:bg-sky-200 transition-colors">
                      <Beaker className="h-3 w-3" />
                      {trialCount} trial{trialCount !== 1 ? "s" : ""}
                    </span>
                  </Link>
                )}
                {uncertainCount > 0 && (
                  <Link href="/subscriptions">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200 px-2.5 py-1.5 rounded-full cursor-pointer hover:bg-slate-200 transition-colors">
                      <HelpCircle className="h-3 w-3" />
                      {uncertainCount} need review
                    </span>
                  </Link>
                )}
                {totalFlagged === 0 && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-green-50 text-green-700 border border-green-200 px-2.5 py-1.5 rounded-full">
                    <CheckCircle2 className="h-3 w-3" />
                    All subscriptions look active
                  </span>
                )}
              </div>

              {/* Cost highlights — top expensive subs, always shown after analysis */}
              {(() => {
                const expensive = [...activeSubs]
                  .sort((a, b) => Number(b.amount) - Number(a.amount))
                  .slice(0, 3)
                  .filter(s => Number(s.amount) >= 15);
                if (expensive.length === 0) return null;
                return (
                  <div className="bg-white border border-orange-100 rounded-lg p-3 space-y-2">
                    <p className="text-xs font-semibold text-orange-800 flex items-center gap-1.5">
                      <TrendingUp className="h-3 w-3" /> Top cost subscriptions
                    </p>
                    <div className="space-y-1.5">
                      {expensive.map(s => (
                        <Link key={s.id} href={`/subscriptions/${s.id}`}>
                          <div className="flex items-center justify-between text-xs hover:bg-orange-50 rounded px-1 py-0.5 transition-colors cursor-pointer">
                            <span className="font-medium text-foreground truncate">{s.merchantName}</span>
                            <span className="text-orange-700 font-semibold ml-2 shrink-0">
                              £{Number(s.amount).toFixed(2)}/{s.billingCycle}
                            </span>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* "Why you see this" expandable section */}
              <div className="border-t border-orange-100 pt-2">
                <button
                  onClick={() => setWhyOpen((o) => !o)}
                  className="flex items-center gap-1.5 text-xs text-orange-600 hover:text-orange-800 transition-colors font-medium"
                >
                  {whyOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  Why you see this
                </button>
                {whyOpen && (() => {
                  const bankCount = activeSubs.filter(s => {
                    const srcs: string[] = Array.isArray((s as any).sources) ? (s as any).sources : [s.source ?? "bank"];
                    return srcs.includes("bank");
                  }).length;
                  const emailCount = activeSubs.filter(s => {
                    const srcs: string[] = Array.isArray((s as any).sources) ? (s as any).sources : [s.source ?? "bank"];
                    return srcs.includes("email");
                  }).length;
                  const highConf = activeSubs.filter(s => (s.confidenceScore ?? 0) >= 0.85).length;
                  return (
                    <div className="mt-2 rounded-md bg-white border border-orange-100 p-3 text-xs text-muted-foreground space-y-1.5">
                      <p className="font-medium text-foreground">How these numbers are calculated</p>
                      <ul className="space-y-1">
                        <li className="flex items-start gap-1.5">
                          <span className="text-orange-400 mt-0.5 shrink-0">•</span>
                          <span>
                            <span className="font-medium text-foreground">{activeSubs.length} active subscription{activeSubs.length !== 1 ? "s" : ""}</span> are tracked in total.
                          </span>
                        </li>
                        <li className="flex items-start gap-1.5">
                          <span className="text-orange-400 mt-0.5 shrink-0">•</span>
                          <span>
                            <span className="font-medium text-foreground">{bankCount}</span> detected from recurring bank payments, <span className="font-medium text-foreground">{emailCount}</span> confirmed via email receipts.
                          </span>
                        </li>
                        <li className="flex items-start gap-1.5">
                          <span className="text-orange-400 mt-0.5 shrink-0">•</span>
                          <span>
                            <span className="font-medium text-foreground">{highConf}</span> have high confidence scores (≥85%) based on multiple detections.
                          </span>
                        </li>
                        {totalFlagged > 0 && (
                          <li className="flex items-start gap-1.5">
                            <span className="text-orange-400 mt-0.5 shrink-0">•</span>
                            <span>
                              <span className="font-medium text-foreground">{totalFlagged}</span> flagged by the insights engine — scored by low transaction frequency, single detection, or email-only source.
                            </span>
                          </li>
                        )}
                        <li className="flex items-start gap-1.5">
                          <span className="text-orange-400 mt-0.5 shrink-0">•</span>
                          <span>Open any subscription to see its full audit trail and confidence breakdown.</span>
                        </li>
                      </ul>
                    </div>
                  );
                })()}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Run analysis to scan your subscriptions for unused services, forgotten trials, and potential savings.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Source insight — only shown when email-detected subs exist */}
      {showSourceInsight && (
        <div className="grid gap-3 sm:grid-cols-2">
          {bothSourceCount > 0 && (
            <div className="flex items-start gap-3 rounded-lg border bg-violet-50 border-violet-100 p-4">
              <div className="h-8 w-8 rounded-full bg-violet-100 flex items-center justify-center shrink-0">
                <CheckCircle2 className="h-4 w-4 text-violet-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-violet-900">
                  {bothSourceCount} subscription{bothSourceCount !== 1 ? "s" : ""} confirmed by both bank & email
                </p>
                <p className="text-xs text-violet-600 mt-0.5">
                  Highest confidence — detected from two independent sources.
                </p>
              </div>
            </div>
          )}
          {emailOnlyCount > 0 && (
            <div className="flex items-start gap-3 rounded-lg border bg-blue-50 border-blue-100 p-4">
              <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                <Mail className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-blue-900">
                  {emailOnlyCount} subscription{emailOnlyCount !== 1 ? "s" : ""} detected from email only
                </p>
                <p className="text-xs text-blue-600 mt-0.5">
                  Connect a bank account to cross-verify and boost confidence.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Unread notifications alert */}
      {unreadNotifications.length > 0 && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 flex items-start space-x-3">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-medium text-destructive-foreground">Needs Attention</h3>
            <p className="text-sm text-destructive-foreground/80 mt-1">
              You have {unreadNotifications.length} unread notification{unreadNotifications.length > 1 ? 's' : ''}.
            </p>
          </div>
          <Button variant="outline" size="sm" className="shrink-0" asChild>
            <Link href="/notifications">View all</Link>
          </Button>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4 shadow-sm border-muted flex flex-col">
          <CardHeader>
            <CardTitle>Spend by Category</CardTitle>
            <CardDescription>Where your money goes each month</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex items-center justify-center min-h-[300px]">
            {loadingCategories ? (
              <div className="flex items-center justify-center h-full w-full">
                <Skeleton className="h-[250px] w-[250px] rounded-full" />
              </div>
            ) : chartData.length === 0 ? (
              <div className="text-center text-muted-foreground flex flex-col items-center">
                <CreditCard className="h-10 w-10 mb-2 opacity-20" />
                <p>Not enough data to display.</p>
                <p className="text-sm">Connect a bank account to see insights.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                    stroke="none"
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    formatter={(value: number) => formatCurrency(value)}
                    contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))' }}
                  />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="col-span-3 shadow-sm border-muted">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Upcoming Renewals</CardTitle>
              <CardDescription>Next 30 days</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild className="hidden sm:flex">
              <Link href="/subscriptions">View all</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {loadingUpcoming ? (
              <div className="space-y-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-[150px]" />
                      <Skeleton className="h-3 w-[100px]" />
                    </div>
                    <Skeleton className="h-4 w-[60px]" />
                  </div>
                ))}
              </div>
            ) : !upcoming || upcoming.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                <p>No upcoming renewals detected.</p>
              </div>
            ) : (
              <div className="space-y-5">
                {upcoming.slice(0, 5).map((sub) => (
                  <Link
                    key={sub.id}
                    href={`/subscriptions/${sub.id}`}
                    className="flex items-center justify-between group hover:bg-muted/50 p-2 -mx-2 rounded-md transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                        {sub.merchantName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {sub.nextRenewalDate ? format(parseISO(sub.nextRenewalDate), 'd MMM yyyy') : 'Unknown date'}
                      </p>
                    </div>
                    <div className="flex items-center space-x-3 ml-4 shrink-0">
                      <div className="text-sm font-medium text-foreground">
                        {formatCurrency(sub.amount)}
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors opacity-0 group-hover:opacity-100" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

    </div>
  );
}

