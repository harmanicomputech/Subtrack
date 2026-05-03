import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { trackBillingEvent } from "@/lib/billing";
import { useAuth } from "@/hooks/use-auth";
import {
  useListSubscriptions,
  useGetDashboardSummary,
  useSyncGmail,
  useGetSubscriptionAudit,
  getGetSubscriptionAuditQueryKey,
  useMarkSubscriptionUnused,
  useIgnoreSubscription,
  getListSubscriptionsQueryKey,
  getGetDashboardSummaryQueryKey,
} from "@workspace/api-client-react";
import type { Subscription, SubscriptionAuditLog } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ConnectModal } from "@/components/ConnectModal";
import {
  ShieldCheck,
  Landmark,
  Mail,
  CheckCircle2,
  TrendingUp,
  ArrowRight,
  Sparkles,
  CreditCard,
  Loader2,
  Eye,
  Lock,
  Info,
  ExternalLink,
  Repeat2,
  ScanSearch,
  CalendarClock,
  ThumbsDown,
  EyeOff,
  Check,
  Trophy,
  Wallet,
  ListChecks,
  TrendingDown,
  Circle,
  Bell,
  Target,
  BadgeCheck,
  RefreshCw,
  Activity,
  AlertCircle,
  Clock,
  Zap,
  Ban,
} from "lucide-react";

type Step = "connect" | "syncing-gmail" | "results" | "summary" | "savings-plan" | "checkout";

const GMAIL_STEPS = [
  "Connecting to Gmail",
  "Searching for receipts",
  "Detecting subscriptions",
  "Running smart analysis",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(n);
}

function getTransactionCount(logs?: SubscriptionAuditLog[]): number | null {
  if (!logs) return null;
  const detected = logs.find((l) => l.eventType === "detected");
  const meta = detected?.metadata as Record<string, unknown> | null | undefined;
  const n = meta?.transactionCount;
  return typeof n === "number" ? n : null;
}

function getMatchedBy(logs?: SubscriptionAuditLog[]): string | null {
  if (!logs) return null;
  const detected = logs.find((l) => l.eventType === "detected");
  const meta = detected?.metadata as Record<string, unknown> | null | undefined;
  const v = meta?.matchedBy;
  return typeof v === "string" ? v : null;
}

function toMonthly(sub: Subscription): number {
  const amt = Number(sub.amount);
  const cycle = (sub.billingCycle ?? "monthly").toLowerCase();
  if (cycle === "annual" || cycle === "yearly") return amt / 12;
  if (cycle === "weekly") return amt * 4.33;
  return amt;
}

function getMiniAuditText(
  sub: Subscription,
  logs?: SubscriptionAuditLog[],
): string {
  const txCount = getTransactionCount(logs);
  const hasBankSource = (sub.sources ?? [sub.source]).includes("bank");
  const hasEmailSource = (sub.sources ?? [sub.source]).includes("email");

  const parts: string[] = [];
  if (hasBankSource && txCount !== null) {
    parts.push(`${txCount} bank transaction${txCount !== 1 ? "s" : ""}`);
  } else if (hasBankSource) {
    parts.push("recurring bank transactions");
  }
  if (hasEmailSource) {
    parts.push("subscription email receipts");
  }
  return parts.length > 0
    ? `Detected from ${parts.join(" + ")}`
    : "Detected from recurring payment pattern";
}

function getConfidenceDots(score: number) {
  const filled = Math.round(score * 5);
  return filled;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SyncingScreen({ steps, label }: { steps: string[]; label: string }) {
  const [activeStep, setActiveStep] = useState(0);
  useEffect(() => {
    const timers = steps.map((_, i) =>
      setTimeout(() => setActiveStep(i + 1), (i + 1) * 900),
    );
    return () => timers.forEach(clearTimeout);
  }, [steps]);

  return (
    <div className="flex flex-col items-center text-center space-y-8">
      <div className="relative">
        <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">
          <Loader2 className="h-10 w-10 text-primary animate-spin" />
        </div>
        <div className="absolute -inset-2 rounded-full border-2 border-primary/20 animate-ping" />
      </div>
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">
          {label}
        </h2>
        <p className="text-muted-foreground mt-2">This takes just a moment…</p>
      </div>
      <div className="w-full max-w-xs space-y-3 text-left">
        {steps.map((step, i) => (
          <div key={step} className="flex items-center gap-3">
            <div
              className={`h-5 w-5 rounded-full flex items-center justify-center shrink-0 transition-all duration-500 ${
                i < activeStep
                  ? "bg-green-500"
                  : i === activeStep
                    ? "bg-primary/20 border-2 border-primary"
                    : "bg-muted border-2 border-muted-foreground/20"
              }`}
            >
              {i < activeStep && (
                <CheckCircle2 className="h-3.5 w-3.5 text-white" />
              )}
            </div>
            <span
              className={`text-sm transition-colors duration-300 ${
                i < activeStep
                  ? "text-foreground font-medium"
                  : i === activeStep
                    ? "text-primary font-medium"
                    : "text-muted-foreground"
              }`}
            >
              {step}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SourceBadges({ sources }: { sources: string[] }) {
  const hasBankSource = sources.includes("bank");
  const hasEmailSource = sources.includes("email");
  return (
    <div className="flex gap-1">
      {hasBankSource && (
        <span className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-blue-50 border-blue-200 text-blue-700">
          Bank
        </span>
      )}
      {hasEmailSource && (
        <span className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-red-50 border-red-200 text-red-600">
          Gmail
        </span>
      )}
    </div>
  );
}

function ConfidenceDots({ score }: { score: number }) {
  const filled = getConfidenceDots(score);
  const pct = Math.round(score * 100);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-0.5 cursor-default">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className={`h-2 w-2 rounded-full ${
                i < filled ? "bg-green-500" : "bg-muted-foreground/20"
              }`}
            />
          ))}
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {pct}% confidence — {pct >= 90 ? "very strong" : pct >= 75 ? "strong" : "good"} match
      </TooltipContent>
    </Tooltip>
  );
}

type ActionState = "none" | "unused" | "ignored";

interface TopSubRowProps {
  sub: Subscription;
  rank: number;
  setLocation: (path: string) => void;
}

function TopSubRow({ sub, rank, setLocation }: TopSubRowProps) {
  const queryClient = useQueryClient();
  const [actionState, setActionState] = useState<ActionState>("none");

  const { data: auditLogs } = useGetSubscriptionAudit(sub.id, {
    query: {
      enabled: true,
      queryKey: getGetSubscriptionAuditQueryKey(sub.id),
    },
  });

  const markUnusedMutation = useMarkSubscriptionUnused();
  const ignoreMutation = useIgnoreSubscription();

  const sources = sub.sources ?? [sub.source];
  const miniText = getMiniAuditText(sub, auditLogs);
  const matchedBy = getMatchedBy(auditLogs);

  const matchedByLabel: Record<string, string> = {
    known_merchant: "Known merchant",
    fuzzy_name: "Name matching",
    recurring_pattern: "Recurring pattern",
    email_receipt: "Email receipt",
  };
  const detectionLabel = matchedBy
    ? (matchedByLabel[matchedBy] ?? matchedBy.replace(/_/g, " "))
    : null;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListSubscriptionsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
  };

  const handleMarkUnused = () => {
    markUnusedMutation.mutate({ id: sub.id }, {
      onSuccess: () => { setActionState("unused"); invalidate(); },
    });
  };

  const handleIgnore = () => {
    ignoreMutation.mutate({ id: sub.id }, {
      onSuccess: () => { setActionState("ignored"); invalidate(); },
    });
  };

  const isActioned = actionState !== "none";
  const isPending = markUnusedMutation.isPending || ignoreMutation.isPending;

  return (
    <div
      className={`py-3 border-b last:border-0 border-border/40 space-y-2 transition-opacity duration-300 ${
        actionState === "ignored" ? "opacity-50" : ""
      }`}
    >
      {/* Top row: name + amount */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-xs font-bold text-muted-foreground w-3.5 shrink-0">
            {rank}
          </span>
          <div
            className={`h-8 w-8 rounded-full flex items-center justify-center font-bold text-xs border shrink-0 transition-colors ${
              actionState === "unused"
                ? "bg-amber-100 text-amber-700 border-amber-200"
                : actionState === "ignored"
                  ? "bg-muted text-muted-foreground border-border"
                  : "bg-primary/10 text-primary border-primary/20"
            }`}
          >
            {sub.merchantName.substring(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-semibold text-foreground leading-tight">
                {sub.merchantName}
              </span>
              <SourceBadges sources={sources} />
              {actionState === "unused" && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                  Marked unused
                </span>
              )}
              {actionState === "ignored" && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border">
                  Ignored
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <ConfidenceDots score={sub.confidenceScore} />
              {detectionLabel && (
                <span className="text-[10px] text-muted-foreground">
                  {detectionLabel}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-sm font-bold text-foreground">
            {fmt(Number(sub.amount))}
            <span className="text-xs font-normal text-muted-foreground">
              /{sub.billingCycle}
            </span>
          </div>
        </div>
      </div>

      {/* Mini audit line */}
      <div className="pl-[1.875rem]">
        <p className="text-xs text-muted-foreground leading-snug">{miniText}</p>
      </div>

      {/* Action row */}
      <div className="pl-[1.875rem] flex items-center gap-1.5">
        {!isActioned ? (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleMarkUnused}
                  disabled={isPending}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-amber-700 hover:bg-amber-50 border border-transparent hover:border-amber-200 rounded px-2 py-1 transition-all disabled:opacity-40"
                >
                  <ThumbsDown className="h-3 w-3" />
                  Not using this
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                Marks this as unused — helps us calculate your potential savings
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleIgnore}
                  disabled={isPending}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-muted-foreground/70 hover:bg-muted border border-transparent hover:border-border rounded px-2 py-1 transition-all disabled:opacity-40"
                >
                  <EyeOff className="h-3 w-3" />
                  Ignore
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                Removes from savings calculations — use if this is expected spend
              </TooltipContent>
            </Tooltip>

            <button
              onClick={() => setLocation(`/subscriptions/${sub.id}`)}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline ml-auto"
            >
              Review <ExternalLink className="h-3 w-3" />
            </button>
          </>
        ) : (
          <div className="flex items-center gap-2 w-full">
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-700">
              <Check className="h-3 w-3" />
              {actionState === "unused" ? "Saved — we'll factor this into your savings" : "Got it — removed from calculations"}
            </span>
            <button
              onClick={() => setLocation(`/subscriptions/${sub.id}`)}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline ml-auto"
            >
              Review <ExternalLink className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();
  const [step, setStep] = useState<Step>("connect");
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isCheckoutLoading, setIsCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const gmailSyncFired = useRef(false);

  const syncGmailMutation = useSyncGmail();
  const { data: subscriptions } = useListSubscriptions();
  const { data: summary } = useGetDashboardSummary();

  useEffect(() => {
    if (!isAuthenticated) {
      setLocation("/login");
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const urlStep = params.get("step") as Step | null;

    // Allow the checkout step to bypass the onboarding_done guard —
    // dashboard redirects here when the user has no billing decision yet.
    if (urlStep === "checkout") {
      setStep("checkout");
      window.history.replaceState({}, "", window.location.pathname);
      console.log("onboarding_step_changed: checkout (direct link)");
      return;
    }

    if (localStorage.getItem("recuris_onboarding_done") === "1") {
      setLocation("/dashboard");
      return;
    }
    if (urlStep && ["syncing-gmail", "results"].includes(urlStep)) {
      setStep(urlStep);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [isAuthenticated, setLocation]);

  useEffect(() => {
    if (step !== "syncing-gmail" || gmailSyncFired.current) return;
    gmailSyncFired.current = true;
    const delay = setTimeout(() => {
      syncGmailMutation.mutate(undefined, {
        onSuccess: () => setStep("results"),
        onError: () => setStep("results"),
      });
    }, 3800);
    return () => clearTimeout(delay);
  }, [step, syncGmailMutation]);

  const handleBankConnect = async () => {
    setIsConnecting(true);
    sessionStorage.setItem("recuris_from_onboarding", "1");
    const token = localStorage.getItem("recuris_token");
    try {
      const res = await fetch("/api/bank/connect", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("connect failed");
      const data = await res.json();
      if (data.authUrl) window.location.href = data.authUrl;
    } catch {
      sessionStorage.removeItem("recuris_from_onboarding");
      setIsConnecting(false);
    }
  };

  const handleGmailConnect = () => {
    sessionStorage.setItem("recuris_from_onboarding", "1");
    setShowConnectModal(true);
  };

  const handleSkip = () => {
    console.log("onboarding_step_changed: checkout");
    setStep("checkout");
  };

  const handleSkipBilling = () => {
    console.log("checkout_skipped");
    localStorage.setItem("recuris_billing_skipped", "1");
    localStorage.setItem("recuris_onboarding_done", "1");
    trackBillingEvent("billing_skipped", "Chose limited access during onboarding");
    console.log("onboarding_completed");
    setLocation("/dashboard");
  };

  const handleSubscribe = async () => {
    console.log("subscription_started");
    setIsCheckoutLoading(true);
    setCheckoutError(null);
    const token = localStorage.getItem("recuris_token");
    try {
      const res = await fetch("/api/billing/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setCheckoutError(data.error ?? "Unable to start checkout. Please try again.");
        return;
      }
      window.location.href = data.url;
    } catch {
      setCheckoutError("Network error. Please try again.");
    } finally {
      setIsCheckoutLoading(false);
    }
  };

  // Computed results data
  const allDetectedSubs = subscriptions ?? [];
  const activeSubs = allDetectedSubs.filter((s) => s.status === "active");
  const top3 = [...activeSubs]
    .sort((a, b) => Number(b.amount) - Number(a.amount))
    .slice(0, 3);
  const biggest = top3[0];
  const monthlySpend = summary?.totalMonthlySpend ?? 0;
  const yearlySpend = summary?.totalYearlySpend ?? 0;

  const bankSubsCount = activeSubs.filter((s) =>
    (s.sources ?? [s.source]).includes("bank"),
  ).length;
  const emailSubsCount = activeSubs.filter((s) =>
    (s.sources ?? [s.source]).includes("email"),
  ).length;
  const multiSourceCount = activeSubs.filter(
    (s) => (s.sources ?? [s.source]).length > 1,
  ).length;

  // Summary step computed values
  const unusedSubs = allDetectedSubs.filter((s) => s.usageStatus === "unused");
  const ignoredSubs = allDetectedSubs.filter((s) => s.usageStatus === "ignored");
  const remainingActiveSubs = allDetectedSubs.filter(
    (s) => s.status === "active" && (s.usageStatus === "active" || !s.usageStatus),
  );
  const unusedMonthlyImpact = unusedSubs.reduce((sum, s) => sum + toMonthly(s), 0);
  const unusedYearlyImpact = unusedMonthlyImpact * 12;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border/40 bg-background/80 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 bg-primary rounded-lg flex items-center justify-center shadow-sm">
            <ShieldCheck className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-lg font-bold text-primary tracking-tight">
            Recuris
          </span>
        </div>
        {step === "connect" && (
          <button
            onClick={handleSkip}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Skip for now
          </button>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-lg">

          {/* ── STEP: CONNECT ─────────────────────────────────────────────── */}
          {step === "connect" && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="text-center space-y-3">
                <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20 mb-2 shadow-sm">
                  <Sparkles className="h-8 w-8 text-primary" />
                </div>
                <h1 className="text-3xl font-bold tracking-tight text-foreground leading-tight">
                  Let's find your hidden<br />subscriptions
                </h1>
                <p className="text-muted-foreground text-base max-w-sm mx-auto leading-relaxed">
                  Connect your bank or Gmail and we'll automatically detect every recurring charge — no manual entry.
                </p>
              </div>

              <Card className="border-amber-200/60 bg-gradient-to-br from-amber-50/80 to-orange-50/40 shadow-sm">
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <div className="h-9 w-9 rounded-full bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
                      <TrendingUp className="h-4 w-4 text-amber-700" />
                    </div>
                    <div className="space-y-2 flex-1">
                      <p className="text-sm font-semibold text-amber-900">Did you know?</p>
                      <p className="text-sm text-amber-800 leading-relaxed">
                        Most UK households have{" "}
                        <span className="font-bold">8–14 active subscriptions</span>{" "}
                        and spend{" "}
                        <span className="font-bold">£48–£120/month</span> on
                        services they've forgotten about.
                      </p>
                      <div className="flex gap-2 pt-1 flex-wrap">
                        {["Netflix", "Spotify", "Adobe CC", "Gym", "iCloud"].map((s) => (
                          <span
                            key={s}
                            className="text-xs bg-amber-100/80 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5"
                          >
                            {s}
                          </span>
                        ))}
                        <span className="text-xs text-amber-600 py-0.5">+ more…</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-3">
                <Button
                  size="lg"
                  className="w-full h-14 text-base font-semibold shadow-md shadow-primary/20"
                  onClick={handleBankConnect}
                  disabled={isConnecting}
                >
                  {isConnecting ? (
                    <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Connecting…</>
                  ) : (
                    <><Landmark className="mr-2 h-5 w-5" />Connect Bank Account</>
                  )}
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full h-14 text-base font-medium"
                  onClick={handleGmailConnect}
                  disabled={isConnecting}
                >
                  <Mail className="mr-2 h-5 w-5 text-red-500" />
                  Scan Gmail Instead
                </Button>
              </div>

              <div className="flex items-center justify-center gap-5 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Eye className="h-3 w-3" /> Read-only access
                </span>
                <span className="flex items-center gap-1.5">
                  <Lock className="h-3 w-3" /> UK Open Banking
                </span>
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="h-3 w-3" /> No credentials stored
                </span>
              </div>
            </div>
          )}

          {/* ── STEP: SYNCING GMAIL ────────────────────────────────────────── */}
          {step === "syncing-gmail" && (
            <div className="animate-in fade-in duration-500">
              <SyncingScreen steps={GMAIL_STEPS} label="Scanning your inbox…" />
            </div>
          )}

          {/* ── STEP: RESULTS ──────────────────────────────────────────────── */}
          {step === "results" && (
            <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-600">

              {/* Header */}
              <div className="text-center space-y-2">
                <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-green-100 border-2 border-green-200 mb-2 shadow-sm">
                  <CheckCircle2 className="h-9 w-9 text-green-600" />
                </div>
                <h1 className="text-3xl font-bold tracking-tight text-foreground">
                  {activeSubs.length > 0
                    ? `We found ${activeSubs.length} subscriptions`
                    : "Setup complete!"}
                </h1>
                <p className="text-muted-foreground text-sm">
                  Here's exactly what we discovered — and how.
                </p>
              </div>

              {/* Total spend hero */}
              {monthlySpend > 0 && (
                <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-background shadow-md overflow-hidden">
                  <CardContent className="p-6 text-center">
                    <p className="text-sm font-medium text-muted-foreground mb-1">
                      Your monthly subscription spend
                    </p>
                    <div className="text-5xl font-extrabold text-foreground tracking-tight">
                      {fmt(monthlySpend)}
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">
                      That's{" "}
                      <span className="font-semibold text-foreground">
                        {fmt(yearlySpend)}
                      </span>{" "}
                      per year across {activeSubs.length} subscriptions
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* ── HOW WE CALCULATED THIS ─────────────────────────────────── */}
              {activeSubs.length > 0 && (
                <Accordion type="single" collapsible className="w-full">
                  <AccordionItem
                    value="calculation"
                    className="border rounded-lg px-4 bg-muted/30"
                  >
                    <AccordionTrigger className="text-sm font-semibold hover:no-underline py-3 gap-2">
                      <span className="flex items-center gap-2">
                        <Info className="h-4 w-4 text-muted-foreground shrink-0" />
                        How we calculated this
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="pb-4">
                      <div className="space-y-4">
                        {/* Source breakdown */}
                        <div className="grid grid-cols-2 gap-2">
                          {bankSubsCount > 0 && (
                            <div className="rounded-md bg-blue-50/70 border border-blue-100 px-3 py-2.5">
                              <p className="text-lg font-bold text-blue-800">
                                {bankSubsCount}
                              </p>
                              <p className="text-xs text-blue-600 leading-snug mt-0.5">
                                found from bank transactions
                              </p>
                            </div>
                          )}
                          {emailSubsCount > 0 && (
                            <div className="rounded-md bg-red-50/70 border border-red-100 px-3 py-2.5">
                              <p className="text-lg font-bold text-red-700">
                                {emailSubsCount}
                              </p>
                              <p className="text-xs text-red-600 leading-snug mt-0.5">
                                found from email receipts
                              </p>
                            </div>
                          )}
                          {multiSourceCount > 0 && (
                            <div className="rounded-md bg-green-50/70 border border-green-100 px-3 py-2.5">
                              <p className="text-lg font-bold text-green-700">
                                {multiSourceCount}
                              </p>
                              <p className="text-xs text-green-600 leading-snug mt-0.5">
                                confirmed by multiple sources
                              </p>
                            </div>
                          )}
                          <div className="rounded-md bg-background border px-3 py-2.5">
                            <p className="text-lg font-bold text-foreground">
                              {activeSubs.length}
                            </p>
                            <p className="text-xs text-muted-foreground leading-snug mt-0.5">
                              total subscriptions found
                            </p>
                          </div>
                        </div>

                        {/* Detection methods */}
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                            Detection methods used
                          </p>
                          <div className="space-y-2">
                            <div className="flex items-start gap-2.5">
                              <div className="h-6 w-6 rounded bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                                <Repeat2 className="h-3.5 w-3.5 text-primary" />
                              </div>
                              <div>
                                <p className="text-xs font-medium text-foreground">
                                  Recurring payment pattern detection
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Finds charges that repeat on a regular schedule
                                </p>
                              </div>
                            </div>
                            <div className="flex items-start gap-2.5">
                              <div className="h-6 w-6 rounded bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                                <ScanSearch className="h-3.5 w-3.5 text-primary" />
                              </div>
                              <div>
                                <p className="text-xs font-medium text-foreground">
                                  Merchant name matching
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Matches transaction descriptions to known services
                                </p>
                              </div>
                            </div>
                            <div className="flex items-start gap-2.5">
                              <div className="h-6 w-6 rounded bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                                <CalendarClock className="h-3.5 w-3.5 text-primary" />
                              </div>
                              <div>
                                <p className="text-xs font-medium text-foreground">
                                  Billing cycle inference
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Identifies whether charges are monthly, annual, etc.
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>

                        <p className="text-xs text-muted-foreground border-t pt-3">
                          Each subscription is given a confidence score from 70–100% based on how many signals confirmed it. You can review the full detection trail for any subscription.
                        </p>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              )}

              {/* ── TOP 3 SUBSCRIPTIONS ───────────────────────────────────── */}
              {top3.length > 0 && (
                <Card className="shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Top subscriptions by cost
                      </p>
                      <Badge variant="outline" className="text-[10px] font-normal">
                        {activeSubs.length} total
                      </Badge>
                    </div>
                    {top3.map((sub, i) => (
                      <TopSubRow
                        key={sub.id}
                        sub={sub}
                        rank={i + 1}
                        setLocation={setLocation}
                      />
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Biggest cost callout */}
              {biggest && Number(biggest.amount) >= 20 && (
                <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50/60 p-4">
                  <CreditCard className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-amber-900">
                      Biggest cost: {biggest.merchantName} at{" "}
                      {fmt(Number(biggest.amount))}/{biggest.billingCycle}
                    </p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      That's {fmt(Number(biggest.amount) * 12)} per year — worth confirming you're still using it.
                    </p>
                  </div>
                </div>
              )}

              {/* Empty state */}
              {activeSubs.length === 0 && (
                <Card className="border-dashed shadow-sm">
                  <CardContent className="py-10 text-center">
                    <CreditCard className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-40" />
                    <p className="text-sm text-muted-foreground">
                      No subscriptions detected yet. You can scan again from
                      your dashboard at any time.
                    </p>
                  </CardContent>
                </Card>
              )}

              <Button
                size="lg"
                className="w-full h-14 text-base font-semibold shadow-md shadow-primary/20"
                onClick={() => setStep("summary")}
              >
                Review your impact
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </div>
          )}

          {/* ── STEP: SUMMARY ──────────────────────────────────────────────── */}
          {step === "summary" && (
            <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-600">

              {/* Header */}
              <div className="text-center space-y-2 pb-1">
                <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 border-2 border-amber-200 mb-2 shadow-sm">
                  <Trophy className="h-9 w-9 text-amber-600" />
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground leading-snug">
                  Here's what you've accomplished
                </h1>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                  You've taken the first step towards taking control of your subscription spend.
                </p>
              </div>

              {/* ── SECTION 1: Subscription Summary ────────────────────────── */}
              <Card className="shadow-sm border-border/60">
                <CardContent className="p-5 space-y-0">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                    Your Subscription Summary
                  </p>
                  <div className="divide-y divide-border/50">
                    <div className="flex items-center justify-between py-2.5">
                      <span className="text-sm text-muted-foreground">Total subscriptions detected</span>
                      <span className="text-sm font-bold text-foreground">{allDetectedSubs.length}</span>
                    </div>
                    <div className="flex items-center justify-between py-2.5">
                      <span className="text-sm text-muted-foreground">Total monthly spend</span>
                      <span className="text-sm font-bold text-foreground">{fmt(monthlySpend)}</span>
                    </div>
                    {unusedSubs.length > 0 && (
                      <div className="flex items-center justify-between py-2.5">
                        <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-amber-400 inline-block" />
                          Marked as unused
                        </span>
                        <span className="text-sm font-bold text-amber-700">{unusedSubs.length}</span>
                      </div>
                    )}
                    {ignoredSubs.length > 0 && (
                      <div className="flex items-center justify-between py-2.5">
                        <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-muted-foreground/40 inline-block" />
                          Ignored
                        </span>
                        <span className="text-sm font-bold text-muted-foreground">{ignoredSubs.length}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between py-2.5">
                      <span className="text-sm text-muted-foreground">Active subscriptions remaining</span>
                      <span className="text-sm font-bold text-foreground">{remainingActiveSubs.length}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* ── SECTION 2: Immediate Impact (only if user took action) ───── */}
              {unusedMonthlyImpact > 0 && (
                <Card className="border-green-200/80 bg-gradient-to-br from-green-50/80 to-emerald-50/40 shadow-sm overflow-hidden">
                  <CardContent className="p-5">
                    <div className="flex items-start gap-3">
                      <div className="h-10 w-10 rounded-full bg-green-100 border border-green-200 flex items-center justify-center shrink-0 mt-0.5">
                        <Wallet className="h-5 w-5 text-green-700" />
                      </div>
                      <div className="flex-1 space-y-1">
                        <p className="text-xs font-semibold text-green-700 uppercase tracking-wide">
                          Your immediate impact
                        </p>
                        <p className="text-base font-bold text-green-900 leading-snug">
                          You've flagged{" "}
                          <span className="text-green-700">{fmt(unusedMonthlyImpact)}/month</span>{" "}
                          as potentially unnecessary
                        </p>
                        <div className="flex items-center gap-1.5 pt-1">
                          <TrendingDown className="h-4 w-4 text-green-600 shrink-0" />
                          <p className="text-sm font-semibold text-green-800">
                            That's{" "}
                            <span className="text-green-700 font-extrabold">{fmt(unusedYearlyImpact)}</span>{" "}
                            in possible savings per year
                          </p>
                        </div>
                        {unusedSubs.length > 0 && (
                          <p className="text-xs text-green-600 pt-0.5">
                            Based on {unusedSubs.length} subscription{unusedSubs.length > 1 ? "s" : ""} you marked as unused:{" "}
                            {unusedSubs.map((s) => s.merchantName).join(", ")}
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* No actions taken — encouragement nudge */}
              {unusedMonthlyImpact === 0 && allDetectedSubs.length > 0 && (
                <div className="flex items-start gap-3 rounded-lg border border-amber-200/60 bg-amber-50/40 p-4">
                  <TrendingDown className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-amber-900">
                      Your savings analysis is ready
                    </p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      We've calculated which subscriptions look unused. Head to the dashboard to see your full savings breakdown.
                    </p>
                  </div>
                </div>
              )}

              {/* ── SECTION 3: What's still active ─────────────────────────── */}
              {remainingActiveSubs.length > 0 && (
                <Card className="shadow-sm border-border/60">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <ListChecks className="h-4 w-4 text-muted-foreground" />
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        What's still active
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {remainingActiveSubs.slice(0, 6).map((s) => (
                        <div
                          key={s.id}
                          className="flex items-center gap-1.5 rounded-full border border-border/60 bg-background px-3 py-1.5 text-xs font-medium text-foreground"
                        >
                          <Circle className="h-1.5 w-1.5 fill-primary text-primary" />
                          {s.merchantName}
                          <span className="text-muted-foreground font-normal">
                            {fmt(toMonthly(s))}/mo
                          </span>
                        </div>
                      ))}
                      {remainingActiveSubs.length > 6 && (
                        <div className="flex items-center rounded-full border border-border/60 bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
                          & {remainingActiveSubs.length - 6} more
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* ── SINGLE CTA ──────────────────────────────────────────────── */}
              <div className="pt-1 space-y-3">
                <Button
                  size="lg"
                  className="w-full h-14 text-base font-semibold shadow-md shadow-primary/20"
                  onClick={() => setStep("savings-plan")}
                >
                  See full savings breakdown
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  Your data is saved — you can always come back to this later.
                </p>
              </div>
            </div>
          )}

          {/* ── STEP: SAVINGS PLAN ─────────────────────────────────────────── */}
          {step === "savings-plan" && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-600">

              {/* Header */}
              <div className="text-center space-y-2 pb-1">
                <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 border-2 border-primary/20 mb-2 shadow-sm">
                  <Target className="h-9 w-9 text-primary" />
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground leading-snug">
                  Your savings plan is ready
                </h1>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                  Recuris is now actively monitoring your subscriptions.
                </p>
              </div>

              {/* ── SECTION 1: Savings recap banner ─────────────────────────── */}
              {unusedMonthlyImpact > 0 ? (
                <Card className="border-primary/25 bg-gradient-to-br from-primary/8 to-background shadow-md overflow-hidden">
                  <CardContent className="p-6 text-center space-y-1">
                    <p className="text-xs font-semibold text-primary/80 uppercase tracking-wide">
                      You're on track to save
                    </p>
                    <div className="text-4xl font-extrabold text-foreground tracking-tight">
                      {fmt(unusedMonthlyImpact)}
                      <span className="text-xl font-semibold text-muted-foreground">/month</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      That's{" "}
                      <span className="font-semibold text-foreground">
                        {fmt(unusedYearlyImpact)}
                      </span>{" "}
                      per year in possible savings
                    </p>
                    <div className="flex items-center justify-center gap-1.5 pt-2">
                      <RefreshCw className="h-3 w-3 text-primary/70" />
                      <p className="text-xs text-primary/80 font-medium">
                        We'll keep tracking these subscriptions for you
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card className="border-primary/20 bg-primary/5 shadow-sm">
                  <CardContent className="p-5 text-center space-y-1">
                    <p className="text-xs font-semibold text-primary/80 uppercase tracking-wide">
                      Being monitored
                    </p>
                    <div className="text-3xl font-extrabold text-foreground tracking-tight">
                      {fmt(monthlySpend)}
                      <span className="text-lg font-semibold text-muted-foreground">/month</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      in subscriptions we're tracking for you
                    </p>
                    <div className="flex items-center justify-center gap-1.5 pt-2">
                      <RefreshCw className="h-3 w-3 text-primary/70" />
                      <p className="text-xs text-primary/80 font-medium">
                        We'll flag opportunities as we find them
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* ── SECTION 2: Action persistence reminder ──────────────────── */}
              <Card className="shadow-sm border-border/60">
                <CardContent className="p-4 space-y-2.5">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                    Your actions this session
                  </p>

                  {unusedSubs.length > 0 && (
                    <div className="flex items-center gap-2.5">
                      <div className="h-7 w-7 rounded-full bg-amber-100 border border-amber-200 flex items-center justify-center shrink-0">
                        <BadgeCheck className="h-4 w-4 text-amber-700" />
                      </div>
                      <p className="text-sm text-foreground">
                        <span className="font-semibold">{unusedSubs.length} subscription{unusedSubs.length > 1 ? "s" : ""}</span>
                        {" "}marked as unused —{" "}
                        <span className="text-muted-foreground">we'll include these in your savings</span>
                      </p>
                    </div>
                  )}

                  {ignoredSubs.length > 0 && (
                    <div className="flex items-center gap-2.5">
                      <div className="h-7 w-7 rounded-full bg-muted border border-border flex items-center justify-center shrink-0">
                        <BadgeCheck className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <p className="text-sm text-foreground">
                        <span className="font-semibold">{ignoredSubs.length} subscription{ignoredSubs.length > 1 ? "s" : ""}</span>
                        {" "}ignored —{" "}
                        <span className="text-muted-foreground">you can revisit these anytime</span>
                      </p>
                    </div>
                  )}

                  <div className="flex items-center gap-2.5">
                    <div className="h-7 w-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                      <ListChecks className="h-4 w-4 text-primary" />
                    </div>
                    <p className="text-sm text-foreground">
                      <span className="font-semibold">{remainingActiveSubs.length} subscription{remainingActiveSubs.length !== 1 ? "s" : ""}</span>
                      {" "}still active —{" "}
                      <span className="text-muted-foreground">review them in your dashboard</span>
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* ── SECTION 3: Retention hook ────────────────────────────────── */}
              <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/30 p-4">
                <div className="h-8 w-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                  <Bell className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    We'll notify you when your savings opportunity changes
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    No action needed — Recuris monitors your subscriptions automatically and alerts you when something needs attention.
                  </p>
                </div>
              </div>

              {/* ── CTA ──────────────────────────────────────────────────────── */}
              <div className="pt-1 space-y-2">
                <Button
                  size="lg"
                  className="w-full h-14 text-base font-semibold shadow-md shadow-primary/20"
                  onClick={() => {
                  console.log("onboarding_step_changed: checkout");
                  setStep("checkout");
                }}
                >
                  Continue to unlock your plan
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  One more step — choose your plan to access the dashboard
                </p>
              </div>
            </div>
          )}

          {/* ── STEP: CHECKOUT ──────────────────────────────────────────────── */}
          {step === "checkout" && (
            <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-600">

              {/* Header */}
              <div className="text-center space-y-2">
                <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20 mb-2 shadow-sm">
                  <CreditCard className="h-8 w-8 text-primary" />
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                  Unlock full Recuris access
                </h1>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                  Continuous monitoring, savings alerts, and cancellation assistance — for less than a coffee a month.
                </p>
              </div>

              {/* Price card */}
              <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-background shadow-md overflow-hidden">
                <CardContent className="p-6">
                  <div className="text-center mb-5">
                    <div className="text-5xl font-extrabold text-foreground tracking-tight">
                      £4
                      <span className="text-xl font-semibold text-muted-foreground">/month</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5">Cancel anytime · No contracts · Billed monthly</p>
                  </div>
                  <div className="space-y-3">
                    {[
                      { Icon: Repeat2, label: "Automatic subscription detection from bank & email" },
                      { Icon: Ban, label: "Cancellation tracking & assistance" },
                      { Icon: TrendingDown, label: "Savings monitoring — we flag wasteful spend" },
                      { Icon: Bell, label: "Real-time renewal notifications" },
                    ].map(({ Icon, label }) => (
                      <div key={label} className="flex items-center gap-2.5">
                        <div className="h-6 w-6 rounded bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                          <Icon className="h-3.5 w-3.5 text-primary" />
                        </div>
                        <span className="text-sm font-medium text-foreground">{label}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Error */}
              {checkoutError && (
                <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2.5 text-center">
                  {checkoutError}
                </p>
              )}

              {/* CTAs */}
              <div className="space-y-3 pt-1">
                <Button
                  size="lg"
                  className="w-full h-14 text-base font-semibold shadow-md shadow-primary/20"
                  onClick={handleSubscribe}
                  disabled={isCheckoutLoading}
                >
                  {isCheckoutLoading ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Connecting to checkout…
                    </>
                  ) : (
                    <>
                      Start subscription
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </>
                  )}
                </Button>
                <button
                  onClick={handleSkipBilling}
                  disabled={isCheckoutLoading}
                  className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors py-2 disabled:opacity-50"
                >
                  Not now — continue with limited access
                </button>
              </div>

              <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground pb-2">
                <Lock className="h-3 w-3" />
                Secure payment · Cancel anytime
              </div>
            </div>
          )}
        </div>
      </div>

      <ConnectModal
        open={showConnectModal}
        onOpenChange={setShowConnectModal}
      />
    </div>
  );
}
