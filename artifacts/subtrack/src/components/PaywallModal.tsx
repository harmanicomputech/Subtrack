import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogOverlay,
  DialogPortal,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  X,
  Sparkles,
  Bell,
  TrendingDown,
  ShieldCheck,
  Zap,
  Mail,
  ArrowRight,
  Lock,
  Loader2,
} from "lucide-react";

interface PaywallModalProps {
  open: boolean;
  onClose: () => void;
  unusedMonthlySavings: number;
  unusedCount: number;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(n);

const FREE_FEATURES = [
  "View all your subscriptions",
  "Basic monthly spend overview",
  "One-time subscription detection",
  "Manual tracking",
];

const PAID_FEATURES = [
  { icon: Zap, label: "Continuous unused subscription detection" },
  { icon: Bell, label: "Real-time renewal alerts" },
  { icon: TrendingDown, label: "Automated savings insights" },
  { icon: ShieldCheck, label: "Priority cancellation assistance" },
  { icon: Mail, label: "Email + bank continuous monitoring" },
];

export function PaywallModal({
  open,
  onClose,
  unusedMonthlySavings,
  unusedCount,
}: PaywallModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubscribe = async () => {
    const token = localStorage.getItem("recuris_token");
    if (!token) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/billing/create-checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();

      if (!res.ok || !data.url) {
        setError(data.error ?? "Unable to start checkout. Please try again.");
        return;
      }

      // Redirect to Stripe Checkout (user returns to /billing/success on completion)
      window.location.href = data.url;
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setError(null);
    onClose();
  };

  const yearlySavings = unusedMonthlySavings * 12;
  const hasSavings = unusedMonthlySavings > 0;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogPortal>
        <DialogOverlay className="bg-black/60 backdrop-blur-sm" />
        <DialogContent className="max-w-md w-full p-0 overflow-hidden border-0 shadow-2xl gap-0 [&>button]:hidden">
          <div className="flex flex-col max-h-[90vh] overflow-y-auto">

            {/* ── Header — value anchor ───────────────────────────────────── */}
            <div className="bg-gradient-to-br from-primary to-primary/80 p-6 text-primary-foreground relative">
              <button
                onClick={handleClose}
                className="absolute top-4 right-4 text-primary-foreground/60 hover:text-primary-foreground transition-colors"
                aria-label="Close"
                disabled={loading}
              >
                <X className="h-4 w-4" />
              </button>

              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="h-4 w-4 text-primary-foreground/80" />
                <span className="text-xs font-semibold text-primary-foreground/80 uppercase tracking-wide">
                  Unlock full control
                </span>
              </div>

              {hasSavings ? (
                <>
                  <p className="text-sm text-primary-foreground/80 mb-1">
                    You've already identified
                  </p>
                  <div className="text-4xl font-extrabold tracking-tight mb-1">
                    {fmt(unusedMonthlySavings)}
                    <span className="text-xl font-semibold text-primary-foreground/70">/month</span>
                  </div>
                  <p className="text-sm text-primary-foreground/80">
                    in potential savings — that's{" "}
                    <span className="font-bold text-primary-foreground">{fmt(yearlySavings)}</span> per year
                  </p>
                </>
              ) : (
                <>
                  <div className="text-2xl font-bold mb-1">
                    {unusedCount > 0
                      ? `${unusedCount} subscription${unusedCount !== 1 ? "s" : ""} flagged for review`
                      : "Your subscriptions are being tracked"}
                  </div>
                  <p className="text-sm text-primary-foreground/80">
                    Keep monitoring to surface more savings over time
                  </p>
                </>
              )}
            </div>

            <div className="p-6 space-y-5">

              {/* Core benefit */}
              <p className="text-sm text-muted-foreground leading-relaxed">
                Recuris helps you track, manage, and reduce your subscriptions automatically — so you never overpay again.
              </p>

              {/* Feature comparison */}
              <div className="space-y-3">
                {/* Free tier */}
                <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2.5">
                    Free — what you have now
                  </p>
                  <div className="space-y-1.5">
                    {FREE_FEATURES.map((f) => (
                      <div key={f} className="flex items-center gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-xs text-muted-foreground">{f}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Paid tier */}
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                  <div className="flex items-center justify-between mb-2.5">
                    <p className="text-xs font-semibold text-primary uppercase tracking-wide">
                      Recuris Pro — £4/month
                    </p>
                    <span className="text-[10px] font-bold text-primary bg-primary/10 border border-primary/20 rounded-full px-2 py-0.5">
                      UNLOCK
                    </span>
                  </div>
                  <div className="space-y-2">
                    {PAID_FEATURES.map(({ icon: Icon, label }) => (
                      <div key={label} className="flex items-center gap-2">
                        <Icon className="h-3.5 w-3.5 text-primary shrink-0" />
                        <span className="text-xs font-medium text-foreground">{label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Social proof */}
              <div className="flex items-start gap-2.5 rounded-lg bg-green-50/60 border border-green-200/60 p-3">
                <TrendingDown className="h-4 w-4 text-green-700 shrink-0 mt-0.5" />
                <p className="text-xs text-green-800 leading-snug">
                  <span className="font-semibold">Most users recover more than £4/month in savings</span>{" "}
                  within their first 30 days of active monitoring.
                </p>
              </div>

              {/* Pricing block */}
              <div className="text-center py-1">
                <div className="text-3xl font-extrabold text-foreground tracking-tight">
                  £4
                  <span className="text-lg font-semibold text-muted-foreground">/month</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Cancel anytime · No contracts</p>
              </div>

              {/* Error */}
              {error && (
                <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2 text-center">
                  {error}
                </p>
              )}

              {/* CTAs */}
              <div className="space-y-2.5 pt-1">
                <Button
                  className="w-full h-12 text-sm font-semibold shadow-md shadow-primary/20"
                  onClick={handleSubscribe}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Connecting to Stripe…
                    </>
                  ) : (
                    <>
                      Start saving more for £4/month
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
                <button
                  onClick={handleClose}
                  disabled={loading}
                  className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1.5 disabled:opacity-50"
                >
                  Continue with free version
                </button>
              </div>

              <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
                <Lock className="h-3 w-3" />
                Secure payment · UK Open Banking certified
              </div>
            </div>
          </div>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
