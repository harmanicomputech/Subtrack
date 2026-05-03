import { useState } from "react";
import { Link, useLocation } from "wouter";
import { isProFeatureAllowed, trackBillingEvent } from "@/lib/billing";
import {
  useListSubscriptions,
  useDetectSubscriptions,
  useAnalyzeSubscriptions,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getListSubscriptionsQueryKey } from "@workspace/api-client-react";
import { format, parseISO } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Search, CreditCard, RefreshCw, ArrowRight, Mail, Landmark,
  CheckCircle2, AlertCircle, CircleDashed, AlertTriangle, Beaker, HelpCircle,
  Lock, X, Sparkles,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

// ── New badge — shown for subscriptions detected within the last 24 hours ──────
function NewBadge({ createdAt }: { createdAt: string }) {
  const isNew = Date.now() - new Date(createdAt).getTime() < TWENTY_FOUR_HOURS;
  if (!isNew) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          className="bg-primary/10 text-primary border-primary/30 hover:bg-primary/10 font-medium text-[10px] gap-1 cursor-default"
        >
          <Sparkles className="h-2.5 w-2.5" /> New
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs max-w-[200px]">
        Detected within the last 24 hours
      </TooltipContent>
    </Tooltip>
  );
}

// ── Source badge ──────────────────────────────────────────────────────────────
function SourceBadge({ sources }: { sources?: string[] | null }) {
  const src = Array.isArray(sources) ? sources : [];
  const hasBank = src.includes("bank");
  const hasEmail = src.includes("email");

  if (hasBank && hasEmail) {
    return (
      <Badge variant="outline" className="bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-50 font-normal text-[10px] gap-1">
        <Landmark className="h-2.5 w-2.5" /><Mail className="h-2.5 w-2.5" /> Both
      </Badge>
    );
  }
  if (hasEmail) {
    return (
      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-50 font-normal text-[10px] gap-1">
        <Mail className="h-2.5 w-2.5" /> Email
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50 font-normal text-[10px] gap-1">
      <Landmark className="h-2.5 w-2.5" /> Bank
    </Badge>
  );
}

// ── Usage status badge ────────────────────────────────────────────────────────
function UsageBadge({ status }: { status: string }) {
  if (status === "unused") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-50 font-normal text-[10px] gap-1 cursor-default">
            <AlertTriangle className="h-2.5 w-2.5" /> May be unused
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs max-w-[200px]">
          No recent activity signal — this subscription may no longer be in use
        </TooltipContent>
      </Tooltip>
    );
  }
  if (status === "trial") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-50 font-normal text-[10px] gap-1 cursor-default">
            <Beaker className="h-2.5 w-2.5" /> Trial
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs max-w-[200px]">
          Detected from email — may be a free trial or forgotten signup
        </TooltipContent>
      </Tooltip>
    );
  }
  if (status === "uncertain") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-50 font-normal text-[10px] gap-1 cursor-default">
            <HelpCircle className="h-2.5 w-2.5" /> Needs review
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs max-w-[200px]">
          Detection confidence is low — please confirm this is an active subscription
        </TooltipContent>
      </Tooltip>
    );
  }
  return null;
}

// ── Confidence pill ───────────────────────────────────────────────────────────
function ConfidencePill({ score }: { score: number }) {
  if (score >= 0.85) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="flex items-center gap-1 text-[10px] text-green-700 bg-green-50 px-1.5 py-0.5 rounded font-medium cursor-default">
            <CheckCircle2 className="h-2.5 w-2.5" /> High
          </span>
        </TooltipTrigger>
        <TooltipContent side="left" className="text-xs">High confidence — detected from multiple sources</TooltipContent>
      </Tooltip>
    );
  }
  if (score >= 0.6) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="flex items-center gap-1 text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded font-medium cursor-default">
            <AlertCircle className="h-2.5 w-2.5" /> Medium
          </span>
        </TooltipTrigger>
        <TooltipContent side="left" className="text-xs">Medium confidence — detected from one source</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-medium cursor-default">
          <CircleDashed className="h-2.5 w-2.5" /> Low
        </span>
      </TooltipTrigger>
      <TooltipContent side="left" className="text-xs">Low confidence — please confirm this subscription</TooltipContent>
    </Tooltip>
  );
}

type UsageFilter = "all" | "unused" | "trial" | "uncertain";

export default function Subscriptions() {
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [usageFilter, setUsageFilter] = useState<UsageFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showUpgradeBanner, setShowUpgradeBanner] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const proAllowed = isProFeatureAllowed();

  const statusParam = statusFilter === "all" ? undefined : statusFilter;
  const { data: subscriptions, isLoading } = useListSubscriptions(
    statusParam ? { status: statusParam } : undefined,
    { query: { queryKey: [...getListSubscriptionsQueryKey(), { status: statusParam }] } },
  );

  const detectMutation = useDetectSubscriptions();
  const analyzeMutation = useAnalyzeSubscriptions();

  const handleDetect = () => {
    if (!proAllowed) {
      trackBillingEvent("upgrade_prompt_clicked", "from_scan_button");
      setShowUpgradeBanner(true);
      return;
    }
    detectMutation.mutate(undefined, {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getListSubscriptionsQueryKey() });
        toast({ title: "Scan complete", description: `Found ${data.detected} new subscriptions, updated ${data.updated}.` });
      },
      onError: () => toast({ variant: "destructive", title: "Scan failed", description: "Could not scan transactions." }),
    });
  };

  const handleAnalyze = () => {
    if (!proAllowed) {
      trackBillingEvent("upgrade_prompt_clicked", "from_analyse_usage_button");
      setShowUpgradeBanner(true);
      return;
    }
    analyzeMutation.mutate(undefined, {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getListSubscriptionsQueryKey() });
        const parts = [];
        if (data.unused > 0) parts.push(`${data.unused} may be unused`);
        if (data.trial > 0) parts.push(`${data.trial} trials`);
        if (data.uncertain > 0) parts.push(`${data.uncertain} need review`);
        toast({
          title: "Analysis complete",
          description: parts.length > 0 ? parts.join(", ") + "." : "All subscriptions look active.",
        });
      },
      onError: () => toast({ variant: "destructive", title: "Analysis failed", description: "Could not analyse subscriptions." }),
    });
  };

  const formatCurrency = (amount: number, currency: string = "GBP") =>
    new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(amount);

  const filtered = (subscriptions ?? []).filter((sub) => {
    const matchesSearch =
      sub.merchantName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (sub.category && sub.category.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesUsage =
      usageFilter === "all" || (sub as any).usageStatus === usageFilter;
    return matchesSearch && matchesUsage;
  });

  const counts = {
    unused: (subscriptions ?? []).filter((s) => (s as any).usageStatus === "unused").length,
    trial: (subscriptions ?? []).filter((s) => (s as any).usageStatus === "trial").length,
    uncertain: (subscriptions ?? []).filter((s) => (s as any).usageStatus === "uncertain").length,
  };
  const totalFlagged = counts.unused + counts.trial + counts.uncertain;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Subscriptions</h2>
          <p className="text-muted-foreground mt-1">Manage and monitor all your recurring payments.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={handleAnalyze}
            disabled={analyzeMutation.isPending}
          >
            <AlertCircle className={`mr-2 h-4 w-4 ${analyzeMutation.isPending ? "animate-spin" : ""}`} />
            {analyzeMutation.isPending ? "Analysing…" : "Analyse Usage"}
          </Button>
          <Button onClick={handleDetect} disabled={detectMutation.isPending}>
            <RefreshCw className={`mr-2 h-4 w-4 ${detectMutation.isPending ? "animate-spin" : ""}`} />
            {detectMutation.isPending ? "Scanning..." : "Scan"}
          </Button>
        </div>
      </div>

      {/* Inline upgrade gate */}
      {showUpgradeBanner && !proAllowed && (
        <div className="rounded-xl border border-amber-200/70 bg-gradient-to-br from-amber-50/50 to-background p-4 flex items-start justify-between gap-4 animate-in slide-in-from-top-1 duration-300">
          <div className="flex items-start gap-3 min-w-0">
            <div className="h-9 w-9 rounded-full bg-amber-100 border border-amber-200 flex items-center justify-center shrink-0">
              <Lock className="h-4 w-4 text-amber-600" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">Upgrade to Pro to use this feature</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                Automated subscription scanning and usage analysis are available on Recuris Pro.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              className="h-9 font-semibold"
              onClick={() => {
                trackBillingEvent("upgrade_clicked", "from_subscriptions_gate");
                setLocation("/onboarding?step=checkout");
              }}
            >
              Upgrade — £4/mo
            </Button>
            <button
              className="text-muted-foreground hover:text-foreground transition-colors p-1"
              onClick={() => setShowUpgradeBanner(false)}
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Status + search bar */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-card p-4 rounded-lg border shadow-sm">
        <Tabs value={statusFilter} onValueChange={setStatusFilter} className="w-full sm:w-auto">
          <TabsList className="grid w-full grid-cols-4 sm:w-auto">
            <TabsTrigger value="active">Active</TabsTrigger>
            <TabsTrigger value="paused">Paused</TabsTrigger>
            <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search merchants..."
            className="pl-9 w-full bg-secondary/50 border-transparent focus-visible:border-primary"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Usage filter strip */}
      {totalFlagged > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-muted-foreground">Filter by usage:</span>
          {(
            [
              { key: "all", label: "All", count: null },
              { key: "unused", label: "May be unused", count: counts.unused, className: "border-orange-200 text-orange-700 bg-orange-50 data-[active=true]:bg-orange-100" },
              { key: "trial", label: "Trials", count: counts.trial, className: "border-sky-200 text-sky-700 bg-sky-50 data-[active=true]:bg-sky-100" },
              { key: "uncertain", label: "Needs review", count: counts.uncertain, className: "border-slate-200 text-slate-600 bg-slate-50 data-[active=true]:bg-slate-100" },
            ] as { key: UsageFilter; label: string; count: number | null; className?: string }[]
          ).map(({ key, label, count, className }) => (
            <button
              key={key}
              data-active={usageFilter === key}
              onClick={() => setUsageFilter(key)}
              className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors
                ${usageFilter === key
                  ? (className ? className.replace(/data-\[active=true\]:(\S+)/g, "$1") : "bg-primary/10 text-primary border-primary/20")
                  : (className ? className.replace(/data-\[active=true\]:\S+\s?/g, "") : "bg-muted text-muted-foreground border-border")
                }`}
            >
              {label}
              {count !== null && count > 0 && (
                <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-current/20 text-[10px] font-bold">{count}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Card key={i} className="overflow-hidden">
              <CardContent className="p-0">
                <div className="flex items-center p-4">
                  <Skeleton className="h-10 w-10 rounded-full mr-4" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-5 w-[150px]" />
                    <Skeleton className="h-4 w-[100px]" />
                  </div>
                  <div className="space-y-2 flex-1 text-right items-end flex flex-col">
                    <Skeleton className="h-5 w-[80px]" />
                    <Skeleton className="h-4 w-[60px]" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 px-4 border rounded-lg bg-card border-dashed">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-secondary mb-4">
            <CreditCard className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium text-foreground mb-1">No subscriptions found</h3>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-6">
            {usageFilter !== "all"
              ? `No ${usageFilter} subscriptions found.`
              : `We couldn't find any ${statusFilter !== "all" ? statusFilter : ""} subscriptions matching your search.`}
          </p>
          {usageFilter !== "all" ? (
            <Button variant="outline" onClick={() => setUsageFilter("all")}>Show all subscriptions</Button>
          ) : statusFilter === "active" ? (
            <Button onClick={handleDetect} variant="outline">Scan recent transactions</Button>
          ) : null}
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((sub) => {
            const sources: string[] = Array.isArray((sub as any).sources)
              ? (sub as any).sources
              : [sub.source ?? "bank"];
            const usageStatus: string = (sub as any).usageStatus ?? "active";
            const createdAt: string = (sub as any).createdAt ?? "";
            const isNegative = usageStatus === "unused" || usageStatus === "trial";

            return (
              <Link key={sub.id} href={`/subscriptions/${sub.id}`}>
                <Card
                  className={`overflow-hidden transition-all hover:shadow-md group cursor-pointer ${
                    isNegative
                      ? "border-orange-200/60 hover:border-orange-300"
                      : "hover:border-primary/20"
                  }`}
                >
                  <CardContent className="p-0">
                    <div className="flex items-center p-4 sm:p-5">
                      <div
                        className={`h-10 w-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 mr-4 border ${
                          isNegative
                            ? "bg-orange-50 text-orange-700 border-orange-200"
                            : "bg-primary/10 text-primary border-primary/20"
                        }`}
                      >
                        {sub.merchantName.substring(0, 2).toUpperCase()}
                      </div>

                      <div className="flex-1 min-w-0 pr-4">
                        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                          <h4 className="text-base font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                            {sub.merchantName}
                          </h4>
                          {/* Status badge */}
                          {sub.status === "active" && (
                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 hover:bg-green-50 font-normal">Active</Badge>
                          )}
                          {sub.status === "cancelled" && (
                            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 hover:bg-red-50 font-normal">Cancelled</Badge>
                          )}
                          {sub.status === "paused" && (
                            <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200 hover:bg-yellow-50 font-normal">Paused</Badge>
                          )}
                          {/* New badge */}
                          {createdAt && <NewBadge createdAt={createdAt} />}
                          {/* Source badge */}
                          <SourceBadge sources={sources} />
                          {/* Usage badge */}
                          <UsageBadge status={usageStatus} />
                        </div>
                        <div className="flex items-center text-xs text-muted-foreground gap-3 flex-wrap">
                          <span className="capitalize">{sub.billingCycle}</span>
                          {sub.category && (
                            <>
                              <span className="w-1 h-1 rounded-full bg-muted-foreground/40" />
                              <span>{sub.category}</span>
                            </>
                          )}
                          {sub.nextRenewalDate && sub.status === "active" && (
                            <>
                              <span className="w-1 h-1 rounded-full bg-muted-foreground/40" />
                              <span>Renews {format(parseISO(sub.nextRenewalDate), "d MMM yyyy")}</span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="text-right flex flex-col items-end justify-center gap-1.5">
                        <div className="text-base sm:text-lg font-bold text-foreground">
                          {formatCurrency(sub.amount, sub.currency)}
                        </div>
                        <ConfidencePill score={sub.confidenceScore} />
                      </div>

                      <div className="ml-4 pl-4 border-l hidden sm:flex items-center text-muted-foreground group-hover:text-primary transition-colors h-10">
                        <ArrowRight className="h-5 w-5 opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
