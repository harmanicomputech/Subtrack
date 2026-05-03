import { useEffect, useState, useRef } from "react";
import { RefreshCw, Activity, Filter } from "lucide-react";
import { getAdminLogs, type LogEntry } from "@/lib/admin-api";

const LEVEL_STYLE: Record<string, string> = {
  info: "text-blue-600",
  warn: "text-amber-600",
  error: "text-red-600",
  debug: "text-gray-400",
};

const STATUS_STYLE = (status?: number) => {
  if (!status) return "text-muted-foreground";
  if (status < 300) return "text-green-600 font-medium";
  if (status < 400) return "text-blue-600 font-medium";
  if (status < 500) return "text-amber-600 font-medium";
  return "text-red-600 font-bold";
};

export default function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [filter, setFilter] = useState<"all" | "error" | "warn">("all");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = async () => {
    try {
      const data = await getAdminLogs(100);
      setLogs(data.logs);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(load, 3000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoRefresh]);

  const filtered = logs.filter((l) => {
    if (filter === "error") return l.level === "error";
    if (filter === "warn") return l.level === "warn" || l.level === "error";
    return true;
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">System Logs</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Last {logs.length} API requests (newest first)
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Filter */}
          <div className="flex items-center gap-1 border border-border rounded-lg overflow-hidden">
            {(["all", "warn", "error"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors capitalize ${
                  filter === f
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          {/* Auto-refresh toggle */}
          <button
            onClick={() => setAutoRefresh((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
              autoRefresh
                ? "bg-primary/10 text-primary border-primary/30"
                : "border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            <Activity className={`h-3.5 w-3.5 ${autoRefresh ? "animate-pulse" : ""}`} />
            Live
          </button>

          <button
            onClick={load}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>
      </div>

      {/* Log table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground w-36">Time</th>
                <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground w-14">Level</th>
                <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground w-14 hidden sm:table-cell">Method</th>
                <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground hidden sm:table-cell">URL</th>
                <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground w-16 hidden md:table-cell">Status</th>
                <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground w-20 hidden lg:table-cell">Duration</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5" colSpan={6}>
                      <div className="h-3 bg-muted rounded animate-pulse w-4/5" />
                    </td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground text-sm">
                    No log entries found
                  </td>
                </tr>
              ) : (
                filtered.map((log, i) => (
                  <tr
                    key={i}
                    className={`border-b border-border last:border-0 hover:bg-muted/30 ${
                      log.level === "error" ? "bg-red-50/50" : log.level === "warn" ? "bg-amber-50/30" : ""
                    }`}
                  >
                    <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">
                      {new Date(log.ts).toLocaleTimeString()}
                    </td>
                    <td className={`px-4 py-2 uppercase font-bold ${LEVEL_STYLE[log.level] ?? "text-muted-foreground"}`}>
                      {log.level}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground font-semibold hidden sm:table-cell">
                      {log.method ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-foreground truncate max-w-xs hidden sm:table-cell">
                      {log.url ?? log.msg ?? "—"}
                    </td>
                    <td className={`px-4 py-2 hidden md:table-cell ${STATUS_STYLE(log.status)}`}>
                      {log.status ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground hidden lg:table-cell">
                      {log.responseTime != null ? `${log.responseTime}ms` : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
