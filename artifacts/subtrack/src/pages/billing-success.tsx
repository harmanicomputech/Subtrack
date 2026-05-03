import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { CheckCircle2, ArrowRight, Zap, Bell, TrendingDown, ShieldCheck, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trackBillingEvent } from "@/lib/billing";

const PRO_FEATURES = [
  { icon: Zap, label: "Continuous unused subscription detection" },
  { icon: Bell, label: "Real-time renewal alerts" },
  { icon: TrendingDown, label: "Automated savings insights" },
  { icon: ShieldCheck, label: "Priority cancellation assistance" },
  { icon: Mail, label: "Email + bank continuous monitoring" },
];

export default function BillingSuccess() {
  const [, setLocation] = useLocation();
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("subtrack_token");
    if (!token) { setLocation("/login"); return; }

    // Mark as subscribed and onboarding complete
    localStorage.setItem("subtrack_subscribed", "1");
    localStorage.setItem("subtrack_onboarding_done", "1");
    localStorage.removeItem("subtrack_billing_skipped");
    trackBillingEvent("subscription_started", "Subscribed to SubTrack Pro");
    console.log("onboarding_completed");

    // Verify subscription status from backend
    fetch("/api/billing/status", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => {
        if (data.subscriptionStatus === "active") {
          localStorage.setItem("subtrack_subscribed", "1");
        }
        setVerified(true);
      })
      .catch(() => setVerified(true));
  }, [setLocation]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-6">

        {/* Icon */}
        <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-green-100 border-2 border-green-200 mx-auto animate-in zoom-in duration-500">
          <CheckCircle2 className="h-11 w-11 text-green-600" />
        </div>

        {/* Heading */}
        <div className="space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-500 delay-100">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">
            Your savings system is now fully active
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            SubTrack Pro is live on your account. We'll continuously monitor your subscriptions and surface every savings opportunity.
          </p>
        </div>

        {/* Pro features */}
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-left space-y-2.5 animate-in fade-in slide-in-from-bottom-2 duration-500 delay-200">
          <p className="text-xs font-semibold text-primary uppercase tracking-wide mb-3">
            Now unlocked
          </p>
          {PRO_FEATURES.map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-2.5">
              <div className="h-6 w-6 rounded bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                <Icon className="h-3.5 w-3.5 text-primary" />
              </div>
              <span className="text-sm font-medium text-foreground">{label}</span>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 delay-300">
          <Button
            className="w-full h-12 text-sm font-semibold"
            onClick={() => setLocation("/dashboard")}
          >
            View my dashboard
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          <p className="text-xs text-muted-foreground mt-3">
            A confirmation email has been sent to your inbox.
          </p>
        </div>
      </div>
    </div>
  );
}
