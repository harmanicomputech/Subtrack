import { useState, useEffect } from "react";
import { ShieldAlert, Eye, EyeOff, Loader2, Clock, AlertTriangle } from "lucide-react";
import { adminLogin } from "@/lib/admin-api";

interface LoginPageProps {
  onLogin: (token: string, expiresAt: number) => Promise<void>;
}

const LOGOUT_MESSAGES: Record<string, { text: string; icon: typeof Clock }> = {
  expired: { text: "Your session expired. Please sign in again.", icon: Clock },
  inactive: { text: "You were signed out due to 15 minutes of inactivity.", icon: Clock },
};

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [secretKey, setSecretKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logoutReason, setLogoutReason] = useState<string | null>(null);

  useEffect(() => {
    const reason = sessionStorage.getItem("admin_logout_reason");
    if (reason) {
      setLogoutReason(reason);
      sessionStorage.removeItem("admin_logout_reason");
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { token, expiresAt } = await adminLogin(secretKey);
      await onLogin(token, expiresAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  const notice = logoutReason ? LOGOUT_MESSAGES[logoutReason] : null;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="h-14 w-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
            <ShieldAlert className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Admin Access</h1>
          <p className="text-sm text-muted-foreground mt-1">Recuris Internal Dashboard</p>
        </div>

        {/* Session notice */}
        {notice && (
          <div className="flex items-center gap-2 mb-4 px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
            <notice.icon className="h-4 w-4 flex-shrink-0" />
            {notice.text}
          </div>
        )}

        {/* Card */}
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Admin Secret Key
              </label>
              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  value={secretKey}
                  onChange={(e) => setSecretKey(e.target.value)}
                  placeholder="Enter admin secret key"
                  autoComplete="current-password"
                  className="w-full px-3 py-2 pr-10 text-sm border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                  required
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
                <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !secretKey}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-semibold rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {loading ? "Verifying…" : "Sign in"}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          This panel is restricted to authorised administrators only.
        </p>
      </div>
    </div>
  );
}
