import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, CreditCard, RefreshCw } from "lucide-react";
import { getAdminBilling, getAdminEnv, type BillingConfig, type EnvVar } from "@/lib/admin-api";

function KeyRow({ label, value, set }: { label: string; value: string; set: boolean }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border last:border-0 gap-4">
      <span className="text-xs font-mono text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        {set ? (
          <span className="text-xs font-mono text-foreground bg-muted px-2 py-0.5 rounded">{value}</span>
        ) : (
          <span className="text-xs text-destructive">(not set)</span>
        )}
        <span className={`h-2 w-2 rounded-full ${set ? "bg-green-500" : "bg-red-400"}`} />
      </div>
    </div>
  );
}

export default function BillingPage() {
  const [billing, setBilling] = useState<BillingConfig | null>(null);
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [b, e] = await Promise.all([getAdminBilling(), getAdminEnv()]);
      setBilling(b);
      // Filter to billing-related keys
      setEnvVars(
        e.vars.filter((v) =>
          ["PAYSTACK_SECRET_KEY", "STRIPE_SECRET_KEY", "STRIPE_PRICE_ID", "STRIPE_WEBHOOK_SECRET"].includes(v.key)
        )
      );
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Billing</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Payment provider configuration and key status</p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => <div key={i} className="h-48 bg-card border border-border rounded-xl animate-pulse" />)}
        </div>
      ) : (
        <>
          {/* Active provider banner */}
          {billing?.activeProvider ? (
            <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-3 flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-green-800">
                  Active provider: <span className="capitalize">{billing.activeProvider}</span>
                </p>
                <p className="text-xs text-green-700">Billing is live and accepting payments.</p>
              </div>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 flex items-center gap-3">
              <XCircle className="h-5 w-5 text-amber-600 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-800">No active billing provider</p>
                <p className="text-xs text-amber-700">Configure Paystack or Stripe environment variables to enable billing.</p>
              </div>
            </div>
          )}

          {/* Provider cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {billing?.providers.map((provider) => (
              <div key={provider.name} className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-muted/30">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <CreditCard className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{provider.label}</p>
                      <p className="text-xs text-muted-foreground capitalize">{provider.name}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {provider.configured ? (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">Configured</span>
                    ) : (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-600">Not configured</span>
                    )}
                    {provider.active && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary">Active</span>
                    )}
                  </div>
                </div>
                <div className="px-5 py-2">
                  {Object.entries(provider.keys).map(([key, val]) => (
                    <KeyRow key={key} label={key} value={val} set={val !== "(not set)"} />
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Read-only note */}
          <p className="text-xs text-muted-foreground text-center">
            Values are read-only and masked for security. Update them in your Replit environment secrets.
          </p>
        </>
      )}
    </div>
  );
}
