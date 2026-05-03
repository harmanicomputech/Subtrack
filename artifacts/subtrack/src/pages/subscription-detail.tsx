import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import {
  useGetSubscription,
  useGetSubscriptionAudit,
  useUpdateSubscription,
  useCreateCancellation,
  getGetSubscriptionQueryKey,
  getGetSubscriptionAuditQueryKey,
  getListSubscriptionsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Calendar, CreditCard, Ban, ShieldAlert, CheckCircle2,
  History, Landmark, Mail, SearchCheck, Info, AlertTriangle, Beaker, HelpCircle,
  GitMerge, Plus, ChevronDown, ChevronUp, BarChart2
} from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────

function confidenceLabel(score: number) {
  if (score >= 0.85) return { label: "High", color: "text-green-700" };
  if (score >= 0.6) return { label: "Medium", color: "text-amber-700" };
  return { label: "Low", color: "text-slate-600" };
}

function detectionNarrative(sources: string[]) {
  const hasBank = sources.includes("bank");
  const hasEmail = sources.includes("email");
  if (hasBank && hasEmail)
    return "This subscription was detected from your bank transactions and confirmed via email receipts — our highest confidence level.";
  if (hasEmail)
    return "This subscription was detected from email receipts in your connected Gmail account.";
  if (hasBank)
    return "This subscription was detected from recurring payments in your linked bank account.";
  return "This subscription was detected automatically.";
}

function SourceChip({ source }: { source: string }) {
  if (source === "bank") return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full">
      <Landmark className="h-3 w-3" /> Bank transaction
    </span>
  );
  if (source === "email") return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-full">
      <Mail className="h-3 w-3" /> Email receipt
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-muted text-muted-foreground border border-border px-2.5 py-1 rounded-full">
      <CheckCircle2 className="h-3 w-3" /> Added manually
    </span>
  );
}

function UsageStatusCard({ usageStatus, insightReason }: { usageStatus: string; insightReason?: string }) {
  if (usageStatus === "active") return null;

  const config = {
    unused: {
      icon: AlertTriangle,
      bg: "bg-orange-50 border-orange-200",
      iconColor: "text-orange-500",
      titleColor: "text-orange-900",
      textColor: "text-orange-700",
      title: "This subscription may be unused",
    },
    trial: {
      icon: Beaker,
      bg: "bg-sky-50 border-sky-200",
      iconColor: "text-sky-500",
      titleColor: "text-sky-900",
      textColor: "text-sky-700",
      title: "This may be a trial or forgotten signup",
    },
    uncertain: {
      icon: HelpCircle,
      bg: "bg-slate-50 border-slate-200",
      iconColor: "text-slate-500",
      titleColor: "text-slate-900",
      textColor: "text-slate-600",
      title: "This subscription needs review",
    },
  }[usageStatus];

  if (!config) return null;
  const Icon = config.icon;

  return (
    <div className={`rounded-lg border p-4 flex items-start gap-3 ${config.bg}`}>
      <Icon className={`h-5 w-5 shrink-0 mt-0.5 ${config.iconColor}`} />
      <div>
        <p className={`text-sm font-semibold ${config.titleColor}`}>{config.title}</p>
        {insightReason && (
          <p className={`text-sm mt-1 leading-relaxed ${config.textColor}`}>{insightReason}</p>
        )}
      </div>
    </div>
  );
}

// ── Audit log entry component ─────────────────────────────────────────────────

type AuditLog = {
  id: number;
  eventType: string;
  source: string;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
};

function auditEventConfig(eventType: string) {
  switch (eventType) {
    case "detected":
      return {
        icon: Plus,
        bg: "bg-emerald-50 border-emerald-200",
        dot: "bg-emerald-500",
        label: "First detected",
        labelColor: "text-emerald-800",
      };
    case "merged":
      return {
        icon: GitMerge,
        bg: "bg-violet-50 border-violet-200",
        dot: "bg-violet-500",
        label: "Merged from source",
        labelColor: "text-violet-800",
      };
    default:
      return {
        icon: History,
        bg: "bg-slate-50 border-slate-200",
        dot: "bg-slate-400",
        label: eventType,
        labelColor: "text-slate-700",
      };
  }
}

function AuditLogEntry({ log }: { log: AuditLog }) {
  const cfg = auditEventConfig(log.eventType);
  const Icon = cfg.icon;
  const meta = log.metadata as Record<string, unknown> | null | undefined;
  const bd = meta?.confidenceBreakdown as { base: number; multiSourceBoost: number; final: number } | undefined;

  return (
    <div className={`rounded-md border p-3 text-xs space-y-1.5 ${cfg.bg}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`flex items-center gap-1.5 font-semibold ${cfg.labelColor}`}>
          <Icon className="h-3.5 w-3.5" /> {cfg.label}
        </span>
        <span className="text-muted-foreground shrink-0">
          {format(parseISO(log.createdAt), "d MMM yyyy, HH:mm")}
        </span>
      </div>

      {/* Source chip */}
      <div className="flex items-center gap-1.5">
        <SourceChip source={log.source} />
      </div>

      {/* Merge details */}
      {log.eventType === "merged" && meta && (
        <div className="space-y-0.5 text-muted-foreground pl-0.5">
          {!!meta.incomingMerchant && (
            <p>Incoming: <span className="font-medium text-foreground">{String(meta.incomingMerchant)}</span></p>
          )}
          {!!meta.matchedTo && (
            <p>Matched to: <span className="font-medium text-foreground">{String(meta.matchedTo)}</span></p>
          )}
          {!!meta.nameMatchType && (
            <p>Match method: <span className="font-medium text-foreground capitalize">{String(meta.nameMatchType).replace(/_/g, " ")}</span></p>
          )}
          {!!meta.newSources && (
            <p>Sources after merge: <span className="font-medium text-foreground">{(meta.newSources as string[]).join(" + ")}</span></p>
          )}
        </div>
      )}

      {/* Detection details */}
      {log.eventType === "detected" && meta && (
        <div className="space-y-0.5 text-muted-foreground pl-0.5">
          {!!meta.matchedBy && (
            <p>Detected via: <span className="font-medium text-foreground capitalize">{String(meta.matchedBy).replace(/_/g, " ")}</span></p>
          )}
          {!!meta.transactionCount && (
            <p>Transactions matched: <span className="font-medium text-foreground">{String(meta.transactionCount)}</span></p>
          )}
        </div>
      )}

      {/* Confidence breakdown */}
      {bd && (
        <div className="flex items-center gap-3 text-muted-foreground pt-0.5">
          <span>Confidence: <span className="font-medium text-foreground">{Math.round(bd.final * 100)}%</span></span>
          {bd.multiSourceBoost > 0 && (
            <span className="text-violet-600">+{Math.round(bd.multiSourceBoost * 100)}% multi-source</span>
          )}
        </div>
      )}
    </div>
  );
}

export default function SubscriptionDetail() {
  const [, params] = useRoute("/subscriptions/:id");
  const [, setLocation] = useLocation();
  const id = params?.id ? parseInt(params.id) : 0;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [cancelMethod, setCancelMethod] = useState("direct_debit");
  const [cancelNotes, setCancelNotes] = useState("");
  const [auditOpen, setAuditOpen] = useState(false);

  const { data: sub, isLoading } = useGetSubscription(id, { query: { enabled: !!id, queryKey: getGetSubscriptionQueryKey(id) } });
  const { data: auditLogs } = useGetSubscriptionAudit(id, { query: { enabled: !!id && auditOpen, queryKey: getGetSubscriptionAuditQueryKey(id) } });
  const updateMutation = useUpdateSubscription();
  const cancelMutation = useCreateCancellation();

  const handleStatusChange = (newStatus: string) => {
    updateMutation.mutate({ id, data: { status: newStatus } }, {
      onSuccess: (data) => {
        queryClient.setQueryData(getGetSubscriptionQueryKey(id), data);
        queryClient.invalidateQueries({ queryKey: getListSubscriptionsQueryKey() });
        toast({ title: "Status updated", description: `Subscription marked as ${newStatus}.` });
      },
      onError: () => toast({ variant: "destructive", title: "Update failed", description: "Could not update subscription status." }),
    });
  };

  const handleCancelRequest = () => {
    cancelMutation.mutate({ data: { subscriptionId: id, method: cancelMethod, notes: cancelNotes } }, {
      onSuccess: () => {
        setIsCancelDialogOpen(false);
        toast({ title: "Cancellation initiated", description: "Your cancellation request is being processed." });
        setLocation("/cancellations");
      },
      onError: (error: any) => toast({ variant: "destructive", title: "Request failed", description: error.error || "Could not initiate cancellation." }),
    });
  };

  const formatCurrency = (amount: number, currency = "GBP") =>
    new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(amount);

  if (isLoading) return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <Skeleton className="h-10 w-10 rounded-full" />
        <Skeleton className="h-8 w-[200px]" />
      </div>
      <Card><CardContent className="space-y-4 pt-6"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-[80%]" /><Skeleton className="h-4 w-[60%]" /></CardContent></Card>
    </div>
  );

  if (!sub) return (
    <div className="text-center py-12">
      <h2 className="text-2xl font-bold">Subscription not found</h2>
      <Button variant="link" onClick={() => setLocation("/subscriptions")} className="mt-4">Return to list</Button>
    </div>
  );

  const sources: string[] = Array.isArray((sub as any).sources) ? (sub as any).sources : [sub.source ?? "bank"];
  const lastDetectedAt: string | null = (sub as any).lastDetectedAt ?? null;
  const usageStatus: string = (sub as any).usageStatus ?? "active";
  const insightReason: string | undefined = (sub as any).insightReason;
  const confidenceBreakdown: { base: number; multiSourceBoost: number; final: number; factors: string[] } | null = (sub as any).confidenceBreakdown ?? null;
  const confidence = confidenceLabel(sub.confidenceScore);

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center space-x-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/subscriptions")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center space-x-3">
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg border border-primary/20">
            {sub.merchantName.substring(0, 2).toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{sub.merchantName}</h1>
            <div className="flex items-center text-sm text-muted-foreground mt-0.5 space-x-2">
              <span className="capitalize">{sub.billingCycle}</span>
              {sub.category && <><span className="w-1 h-1 rounded-full bg-muted-foreground/40" /><span>{sub.category}</span></>}
            </div>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {sub.status === "active" && <Badge className="bg-green-100 text-green-800 hover:bg-green-100 border-none text-sm px-3 py-1">Active</Badge>}
          {sub.status === "cancelled" && <Badge variant="secondary" className="bg-red-50 text-red-700 border-red-200 text-sm px-3 py-1">Cancelled</Badge>}
          {sub.status === "paused" && <Badge variant="secondary" className="bg-yellow-50 text-yellow-700 border-yellow-200 text-sm px-3 py-1">Paused</Badge>}
          {usageStatus === "unused" && <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 text-sm px-3 py-1 gap-1"><AlertTriangle className="h-3.5 w-3.5" /> May be unused</Badge>}
          {usageStatus === "trial" && <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-200 text-sm px-3 py-1 gap-1"><Beaker className="h-3.5 w-3.5" /> Trial</Badge>}
          {usageStatus === "uncertain" && <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200 text-sm px-3 py-1 gap-1"><HelpCircle className="h-3.5 w-3.5" /> Review needed</Badge>}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2 space-y-6">

          {/* Usage insight banner — shown when not "active" */}
          <UsageStatusCard usageStatus={usageStatus} insightReason={insightReason} />

          {/* Contextual tip — shown for active subscriptions that have a specific insight */}
          {usageStatus === "active" && insightReason && (
            <div className="flex items-start gap-3 rounded-lg border bg-slate-50 border-slate-200 p-4">
              <Info className="h-4 w-4 text-slate-500 shrink-0 mt-0.5" />
              <p className="text-sm text-slate-700 leading-relaxed">{insightReason}</p>
            </div>
          )}

          {/* Details */}
          <Card className="shadow-sm border-muted">
            <CardHeader className="pb-4"><CardTitle>Details</CardTitle></CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-6">
                <div>
                  <dt className="text-sm font-medium text-muted-foreground flex items-center mb-1"><CreditCard className="h-4 w-4 mr-2" /> Cost</dt>
                  <dd className="text-2xl font-bold text-foreground">{formatCurrency(sub.amount, sub.currency)}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted-foreground flex items-center mb-1"><Calendar className="h-4 w-4 mr-2" /> Next Renewal</dt>
                  <dd className="text-lg font-medium text-foreground">
                    {sub.nextRenewalDate ? format(parseISO(sub.nextRenewalDate), "d MMMM yyyy") : "Unknown"}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted-foreground mb-1">Status</dt>
                  <dd>
                    <Select value={sub.status} onValueChange={handleStatusChange}>
                      <SelectTrigger className="w-full sm:w-[180px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="paused">Paused</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted-foreground mb-1">Detection Confidence</dt>
                  <dd className="flex items-center gap-3">
                    <div className="w-full max-w-[120px] bg-secondary rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${sub.confidenceScore >= 0.85 ? "bg-green-500" : sub.confidenceScore >= 0.6 ? "bg-amber-500" : "bg-slate-400"}`}
                        style={{ width: `${sub.confidenceScore * 100}%` }}
                      />
                    </div>
                    <span className={`text-sm font-semibold ${confidence.color}`}>{confidence.label}</span>
                    <span className="text-xs text-muted-foreground">({Math.round(sub.confidenceScore * 100)}%)</span>
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          {/* How we calculated this */}
          <Card className="shadow-sm border-muted">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <SearchCheck className="h-4 w-4 text-muted-foreground" /> How we calculated this
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Detection narrative */}
              <p className="text-sm text-muted-foreground leading-relaxed flex gap-2">
                <Info className="h-4 w-4 shrink-0 mt-0.5 text-primary/60" />
                {detectionNarrative(sources)}
              </p>

              {/* Sources */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Detection sources</p>
                <div className="flex flex-wrap gap-2">
                  {sources.map((s) => <SourceChip key={s} source={s} />)}
                </div>
              </div>

              {/* Last detected + confidence */}
              <div className="grid grid-cols-2 gap-4 pt-1">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Confidence level</p>
                  <p className={`text-sm font-semibold mt-0.5 ${confidence.color}`}>
                    {confidence.label} ({Math.round(sub.confidenceScore * 100)}%)
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Last detected</p>
                  <p className="text-sm font-medium mt-0.5 text-foreground">
                    {(lastDetectedAt ?? sub.createdAt)
                      ? format(parseISO(lastDetectedAt ?? sub.createdAt), "d MMM yyyy, HH:mm")
                      : "Unknown"}
                  </p>
                </div>
              </div>

              {/* Confidence breakdown */}
              {confidenceBreakdown && confidenceBreakdown.factors.length > 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded-md p-3 space-y-2">
                  <p className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                    <BarChart2 className="h-3.5 w-3.5" /> Confidence score breakdown
                  </p>
                  <ul className="space-y-1">
                    {confidenceBreakdown.factors.map((f, i) => (
                      <li key={i} className="text-xs text-slate-600 flex items-start gap-1.5">
                        <span className="text-slate-400 mt-0.5">•</span> {f}
                      </li>
                    ))}
                  </ul>
                  <div className="pt-1 border-t border-slate-200">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">Final score</span>
                      <span className={`font-semibold ${confidence.color}`}>
                        {Math.round(confidenceBreakdown.final * 100)}% — {confidence.label}
                      </span>
                    </div>
                    <div className="mt-1.5 bg-slate-200 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full ${confidenceBreakdown.final >= 0.85 ? "bg-green-500" : confidenceBreakdown.final >= 0.6 ? "bg-amber-500" : "bg-slate-400"}`}
                        style={{ width: `${confidenceBreakdown.final * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Multi-source confirmation */}
              {sources.length > 1 && (
                <div className="flex items-start gap-2 bg-violet-50 border border-violet-100 rounded-md p-3">
                  <CheckCircle2 className="h-4 w-4 text-violet-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-violet-700 leading-relaxed">
                    <span className="font-semibold">Confirmed from multiple sources.</span> Independently detected from both bank and email — our highest confidence rating.
                  </p>
                </div>
              )}

              {/* Audit trail toggle */}
              <div className="border-t border-muted pt-3">
                <button
                  onClick={() => setAuditOpen((o) => !o)}
                  className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors w-full text-left"
                >
                  <History className="h-3.5 w-3.5" />
                  {auditOpen ? "Hide" : "Show"} full audit trail
                  {auditOpen ? <ChevronUp className="h-3.5 w-3.5 ml-auto" /> : <ChevronDown className="h-3.5 w-3.5 ml-auto" />}
                </button>

                {auditOpen && (
                  <div className="mt-3 space-y-2">
                    {!auditLogs ? (
                      <div className="space-y-2">
                        <Skeleton className="h-12 w-full" />
                        <Skeleton className="h-12 w-full" />
                      </div>
                    ) : auditLogs.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">No audit events recorded yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {auditLogs.map((log) => (
                          <AuditLogEntry key={log.id} log={log} />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Low-confidence warning */}
          {sub.confidenceScore < 0.6 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start space-x-3">
              <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-medium text-amber-800">Unverified subscription</h4>
                <p className="text-sm text-amber-700/80 mt-1">We suspect this is a recurring payment but aren't fully confident. Please confirm whether it's active.</p>
                <div className="mt-3 flex space-x-3">
                  <Button size="sm" variant="outline" className="border-amber-300 text-amber-800 hover:bg-amber-100" onClick={() => handleStatusChange("active")}>
                    <CheckCircle2 className="h-4 w-4 mr-2" /> Confirm Active
                  </Button>
                  <Button size="sm" variant="ghost" className="text-amber-800 hover:bg-amber-100" onClick={() => handleStatusChange("cancelled")}>
                    Not a subscription
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-6">
          {/* Cancel */}
          <Card className="shadow-sm border-destructive/20 bg-destructive/5 overflow-hidden relative">
            <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
              <Ban className="w-32 h-32 text-destructive" />
            </div>
            <CardHeader>
              <CardTitle className="text-destructive">Cancel Subscription</CardTitle>
              <CardDescription>Stop paying for this service</CardDescription>
            </CardHeader>
            <CardContent className="relative z-10">
              <p className="text-sm mb-4">SubTrack can help you cancel this subscription or block the payment at the bank level.</p>
              <Dialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="destructive" className="w-full shadow-sm shadow-destructive/20">
                    <Ban className="h-4 w-4 mr-2" /> Initiate Cancellation
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Cancel {sub.merchantName}</DialogTitle>
                    <DialogDescription>Choose how you want SubTrack to handle this cancellation.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="method">Cancellation Method</Label>
                      <Select value={cancelMethod} onValueChange={setCancelMethod}>
                        <SelectTrigger id="method"><SelectValue placeholder="Select a method" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="direct_debit">Block Direct Debit / Card</SelectItem>
                          <SelectItem value="email">Send Cancellation Email</SelectItem>
                          <SelectItem value="manual">I'll do it manually</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground mt-1">
                        {cancelMethod === "direct_debit" && "We'll instruct your bank to block future payments to this merchant."}
                        {cancelMethod === "email" && "We'll draft and send a legal cancellation request on your behalf."}
                        {cancelMethod === "manual" && "We'll mark it as pending and you can confirm when it's done."}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="notes">Notes (Optional)</Label>
                      <Textarea id="notes" placeholder="Any account numbers or details needed..." value={cancelNotes} onChange={(e) => setCancelNotes(e.target.value)} className="resize-none h-20" />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsCancelDialogOpen(false)}>Cancel</Button>
                    <Button variant="destructive" onClick={handleCancelRequest} disabled={cancelMutation.isPending}>
                      {cancelMutation.isPending ? "Processing..." : "Confirm Cancellation"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>

          {/* History */}
          <Card className="shadow-sm border-muted">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center">
                <History className="h-4 w-4 mr-2 text-muted-foreground" /> History
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 relative before:absolute before:inset-0 before:ml-2 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-muted before:to-transparent">
                <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                  <div className="flex items-center justify-center w-5 h-5 rounded-full border border-primary bg-background shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 text-primary">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                  </div>
                  <div className="w-[calc(100%-2.5rem)] md:w-[calc(50%-1.5rem)] pl-3 md:pl-0 md:group-odd:pr-3 md:group-even:pl-3">
                    <span className="text-sm font-medium text-foreground">Updated</span>
                    <p className="text-xs text-muted-foreground">{format(parseISO(sub.updatedAt), "d MMM, HH:mm")}</p>
                  </div>
                </div>
                {lastDetectedAt && lastDetectedAt !== sub.createdAt && (
                  <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group">
                    <div className="flex items-center justify-center w-5 h-5 rounded-full border bg-blue-50 border-blue-200 shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                    </div>
                    <div className="w-[calc(100%-2.5rem)] md:w-[calc(50%-1.5rem)] pl-3 md:pl-0 md:group-odd:pr-3 md:group-even:pl-3">
                      <span className="text-sm font-medium text-foreground">Last detected</span>
                      <p className="text-xs text-muted-foreground">{format(parseISO(lastDetectedAt), "d MMM, HH:mm")}</p>
                    </div>
                  </div>
                )}
                <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group">
                  <div className="flex items-center justify-center w-5 h-5 rounded-full border bg-muted shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10" />
                  <div className="w-[calc(100%-2.5rem)] md:w-[calc(50%-1.5rem)] pl-3 md:pl-0 md:group-odd:pr-3 md:group-even:pl-3">
                    <span className="text-sm font-medium text-foreground">Detected</span>
                    <p className="text-xs text-muted-foreground">{format(parseISO(sub.createdAt), "d MMM, HH:mm")}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
