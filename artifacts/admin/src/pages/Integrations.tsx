import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, Plug, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { getAdminIntegrations, getAdminFlags, updateAdminFlag, type IntegrationInfo, type FeatureFlag } from "@/lib/admin-api";

function IntegrationCard({ name, info }: { name: string; info: IntegrationInfo }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Plug className="h-4 w-4 text-primary" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-foreground">{info.label}</p>
            <p className="text-xs text-muted-foreground capitalize">{name}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {info.configured ? (
            <span className="flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
              <CheckCircle2 className="h-3 w-3" /> Configured
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs font-medium text-red-600 bg-red-100 px-2 py-0.5 rounded-full">
              <XCircle className="h-3 w-3" /> Not configured
            </span>
          )}
          {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>
      {open && (
        <div className="border-t border-border px-5 py-3">
          {Object.entries(info.keys).map(([key, val]) => (
            <div key={key} className="flex items-center justify-between py-2.5 border-b border-border last:border-0 gap-4">
              <span className="text-xs font-mono text-muted-foreground">{key}</span>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-mono px-2 py-0.5 rounded ${val === "(not set)" ? "text-destructive" : "text-foreground bg-muted"}`}>
                  {val}
                </span>
                <span className={`h-2 w-2 rounded-full ${val === "(not set)" ? "bg-red-400" : "bg-green-500"}`} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FlagToggle({ flag, onChange }: { flag: FeatureFlag; onChange: (key: string, enabled: boolean) => void }) {
  const [pending, setPending] = useState(false);

  const toggle = async () => {
    setPending(true);
    try {
      await updateAdminFlag(flag.key, !flag.enabled);
      onChange(flag.key, !flag.enabled);
    } catch (e) {
      console.error(e);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
      <div>
        <p className="text-sm font-medium text-foreground">{flag.key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</p>
        <p className="text-xs text-muted-foreground">{flag.description}</p>
      </div>
      <button
        onClick={toggle}
        disabled={pending}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 disabled:opacity-60 ${
          flag.enabled ? "bg-primary" : "bg-muted-foreground/30"
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
            flag.enabled ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Record<string, IntegrationInfo> | null>(null);
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [intgs, f] = await Promise.all([getAdminIntegrations(), getAdminFlags()]);
      setIntegrations(intgs);
      setFlags(f.flags);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleFlagChange = (key: string, enabled: boolean) => {
    setFlags((prev) => prev.map((f) => f.key === key ? { ...f, enabled } : f));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Integrations</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Third-party service credentials and feature flags</p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-card border border-border rounded-xl animate-pulse" />)}
        </div>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">External Services</h2>
            {Object.entries(integrations ?? {}).map(([name, info]) => (
              <IntegrationCard key={name} name={name} info={info} />
            ))}
          </section>

          <section>
            <h2 className="text-sm font-semibold text-foreground mb-3">Feature Flags</h2>
            <div className="bg-card border border-border rounded-xl px-5 py-1">
              {flags.map((flag) => (
                <FlagToggle key={flag.key} flag={flag} onChange={handleFlagChange} />
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Flags are in-memory and reset on server restart.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
