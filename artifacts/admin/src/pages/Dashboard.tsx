import { useEffect, useState } from "react";
import { Users, CreditCard, TrendingUp, Landmark, Activity, Database, Clock, Zap } from "lucide-react";
import { getAdminStats, getAdminHealth, type AdminStats, type AdminHealth } from "@/lib/admin-api";

function StatCard({
  label,
  value,
  icon: Icon,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
          <p className={`text-3xl font-bold ${accent ?? "text-foreground"}`}>{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
        </div>
        <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
          <Icon className="h-4 w-4 text-primary" />
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
        ok ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-green-500" : "bg-red-500"}`} />
      {label}
    </span>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [health, setHealth] = useState<AdminHealth | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getAdminStats(), getAdminHealth()])
      .then(([s, h]) => { setStats(s); setHealth(h); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const proRate = stats ? Math.round((stats.proUsers / Math.max(stats.totalUsers, 1)) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Overview</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Live snapshot of the Recuris platform</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-5 h-28 animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <StatCard label="Total Users" value={stats?.totalUsers ?? 0} icon={Users} sub={`${proRate}% on Pro`} />
            <StatCard label="Pro Users" value={stats?.proUsers ?? 0} icon={TrendingUp} accent="text-primary" />
            <StatCard label="Free Users" value={stats?.freeUsers ?? 0} icon={Users} />
            <StatCard label="Subscriptions" value={stats?.totalSubscriptions ?? 0} icon={CreditCard} sub="Detected across all users" />
            <StatCard label="Bank Connections" value={stats?.bankConnections ?? 0} icon={Landmark} />
            <StatCard label="Billing Events" value={stats?.billingEvents ?? 0} icon={Activity} />
          </div>

          {/* System health */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" /> System Health
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">API Server</span>
                <StatusBadge ok={health?.api.status === "ok"} label={health?.api.status === "ok" ? "Healthy" : "Degraded"} />
                {health && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" /> Uptime: {Math.floor(health.api.uptime / 60)}m {health.api.uptime % 60}s
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Database</span>
                <StatusBadge ok={health?.db.status === "ok"} label={health?.db.status === "ok" ? "Connected" : "Error"} />
                {health && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Database className="h-3 w-3" /> Latency: {health.db.latencyMs}ms
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Environment</span>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium w-fit ${
                    health?.env === "production"
                      ? "bg-orange-100 text-orange-700"
                      : "bg-blue-100 text-blue-700"
                  }`}
                >
                  {health?.env ?? "unknown"}
                </span>
                {health && (
                  <span className="text-xs text-muted-foreground">
                    {new Date(health.timestamp).toLocaleTimeString()}
                  </span>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
