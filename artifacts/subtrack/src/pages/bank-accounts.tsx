import { useState, useEffect } from "react";
import {
  useListBankConnections,
  useDeleteBankConnection,
  getListBankConnectionsQueryKey,
  getListSubscriptionsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Landmark, RefreshCw, Trash2, Plus, AlertCircle, CheckCircle2,
  FlaskConical, ShieldCheck, Wifi,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

// ── Types ─────────────────────────────────────────────────────────────────────

interface BankConnectResponse {
  configured: boolean;
  authUrl: string;
  environment: string;
  mockMode?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isSandbox(env?: string | null) {
  return !env || env === "sandbox";
}

// ── Main component ────────────────────────────────────────────────────────────

export default function BankAccounts() {
  const { data: banks, isLoading } = useListBankConnections();
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const deleteMutation = useDeleteBankConnection();

  // ── Handle return from OAuth (real or mock) ─────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const success = params.get("success");
    const error = params.get("error");
    const bank = params.get("bank");
    const env = params.get("env");
    const isMock = params.get("mock") === "1";

    if (success === "connected") {
      queryClient.invalidateQueries({ queryKey: getListBankConnectionsQueryKey() });
      toast({
        title: "Bank connected",
        description: isMock
          ? `${bank ?? "Test bank"} connected with 6 months of realistic test data.`
          : `${bank ?? "Bank"} connected successfully via Open Banking.`,
      });
      window.history.replaceState({}, "", window.location.pathname);

      const fromOnboarding = sessionStorage.getItem("subtrack_from_onboarding");
      if (fromOnboarding) {
        sessionStorage.removeItem("subtrack_from_onboarding");
        // Sync + analyze, then redirect to onboarding results
        triggerSync(false).then(() => {
          window.location.href = `${window.location.origin}${import.meta.env.BASE_URL}onboarding?step=results`;
        });
      } else {
        triggerSync(false);
      }
    }

    if (error) {
      const messages: Record<string, string> = {
        invalid_state: "Security check failed. Please try again.",
        missing_params: "Connection was incomplete. Please try again.",
        connection_failed: "Could not complete the bank connection.",
        missing_state: "OAuth state was missing. Please try again.",
      };
      toast({
        variant: "destructive",
        title: "Connection failed",
        description: messages[error] ?? decodeURIComponent(error),
      });
      window.history.replaceState({}, "", window.location.pathname);
    }

    void env; // used in badge on card, not here
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Connect via Open Banking ────────────────────────────────────────────
  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      const token = localStorage.getItem("subtrack_token");
      const res = await fetch("/api/bank/connect", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error("Failed to get auth URL");

      const data: BankConnectResponse = await res.json();

      if (!data.configured) {
        toast({
          variant: "destructive",
          title: "Open Banking not configured",
          description: "TrueLayer credentials are not set up yet.",
        });
        return;
      }

      // Redirect the browser to TrueLayer (or our mock callback)
      window.location.href = data.authUrl;
    } catch {
      toast({
        variant: "destructive",
        title: "Connection failed",
        description: "Could not start the bank connection flow.",
      });
      setIsConnecting(false);
    }
  };

  // ── Sync all banks ──────────────────────────────────────────────────────
  const triggerSync = async (showToast = true) => {
    setIsSyncing(true);
    try {
      const token = localStorage.getItem("subtrack_token");
      const res = await fetch("/api/bank/sync", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error("Sync failed");

      const result = await res.json() as {
        connectionsProcessed: number;
        transactionsSynced: number;
        subscriptionsDetected: number;
        errors: string[];
      };

      // Auto-run insights analysis after every sync so the dashboard
      // immediately reflects any flagged/high-value subscriptions.
      fetch("/api/subscriptions/analyze", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).then(() => {
        queryClient.invalidateQueries({ queryKey: getListSubscriptionsQueryKey() });
      }).catch(() => {/* non-critical */});

      queryClient.invalidateQueries({ queryKey: getListBankConnectionsQueryKey() });

      if (showToast) {
        toast({
          title: "Sync complete",
          description: `${result.transactionsSynced} transactions synced · ${result.subscriptionsDetected} subscriptions detected.`,
        });
      }

      if (result.errors.length > 0) {
        result.errors.forEach((err) =>
          toast({ variant: "destructive", title: "Sync warning", description: err }),
        );
      }
    } catch {
      if (showToast) {
        toast({ variant: "destructive", title: "Sync failed", description: "Could not pull latest bank data." });
      }
    } finally {
      setIsSyncing(false);
    }
  };

  // ── Disconnect ──────────────────────────────────────────────────────────
  const handleDelete = (id: number, bankName: string) => {
    if (!confirm(`Disconnect ${bankName}? Your subscription history will be preserved.`)) return;

    deleteMutation.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListBankConnectionsQueryKey() });
          toast({ title: "Disconnected", description: `${bankName} has been removed.` });
        },
        onError: () => {
          toast({ variant: "destructive", title: "Failed", description: "Could not disconnect the bank." });
        },
      },
    );
  };

  // ── Render ──────────────────────────────────────────────────────────────

  const hasBanks = banks && banks.length > 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Bank Accounts</h2>
          <p className="text-muted-foreground mt-1">
            Connect your accounts securely using UK Open Banking.
          </p>
        </div>

        <div className="flex gap-2 shrink-0">
          {hasBanks && (
            <Button
              variant="outline"
              onClick={() => triggerSync(true)}
              disabled={isSyncing}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
              {isSyncing ? "Syncing…" : "Sync All"}
            </Button>
          )}

          <Button onClick={handleConnect} disabled={isConnecting}>
            <Plus className="mr-2 h-4 w-4" />
            {isConnecting ? "Connecting…" : "Connect Bank"}
          </Button>
        </div>
      </div>

      {/* Open Banking compliance notice */}
      <div className="flex items-start gap-3 bg-muted/40 border rounded-lg px-4 py-3">
        <ShieldCheck className="h-4 w-4 mt-0.5 text-green-600 shrink-0" />
        <p className="text-xs text-muted-foreground">
          SubTrack uses <span className="font-medium text-foreground">UK Open Banking</span> (read-only access only).
          We never see your login credentials. You can revoke access at any time from your bank.
        </p>
      </div>

      {/* Connection cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          <>
            {[1, 2].map((i) => (
              <Card key={i} className="overflow-hidden">
                <CardHeader className="pb-4">
                  <Skeleton className="h-6 w-[150px]" />
                  <Skeleton className="h-4 w-[100px] mt-2" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-10 w-full" />
                </CardContent>
              </Card>
            ))}
          </>
        ) : !hasBanks ? (
          <Card className="col-span-full border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <div className="h-16 w-16 bg-secondary rounded-full flex items-center justify-center mb-4">
                <Landmark className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-bold mb-2">No bank accounts connected</h3>
              <p className="text-muted-foreground max-w-sm mb-6">
                Connect your primary spending account so SubTrack can automatically find and track
                your subscriptions.
              </p>
              <Button onClick={handleConnect} disabled={isConnecting} size="lg">
                <Plus className="mr-2 h-4 w-4" />
                {isConnecting ? "Starting connection…" : "Connect Your Bank"}
              </Button>
            </CardContent>
          </Card>
        ) : (
          banks.map((bank) => {
            const sandbox = isSandbox(bank.environment);
            const isMockBank = bank.provider?.startsWith("mock-") ?? false;

            return (
              <Card key={bank.id} className="overflow-hidden shadow-sm">
                {/* Coloured top stripe */}
                <div className={`h-1.5 w-full ${sandbox ? "bg-amber-400/60" : "bg-green-500/60"}`} />

                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex items-center gap-3">
                      {/* Bank logo / avatar */}
                      <div className="h-10 w-10 bg-primary/10 rounded-lg flex items-center justify-center text-primary font-bold shadow-sm shrink-0">
                        {bank.bankName.charAt(0)}
                      </div>

                      <div>
                        <CardTitle className="text-base leading-tight">{bank.bankName}</CardTitle>

                        {/* Status line */}
                        <div className="flex items-center mt-1 text-xs text-muted-foreground">
                          {bank.status === "connected" ? (
                            <>
                              <CheckCircle2 className="h-3 w-3 mr-1 text-green-500" />
                              Connected via Open Banking
                            </>
                          ) : bank.status === "error" ? (
                            <>
                              <AlertCircle className="h-3 w-3 mr-1 text-destructive" />
                              Connection error
                            </>
                          ) : (
                            <>
                              <AlertCircle className="h-3 w-3 mr-1" />
                              Disconnected
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Environment / mode badge */}
                    {sandbox ? (
                      <Badge
                        variant="outline"
                        className="text-xs border-amber-400 text-amber-700 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-300 shrink-0"
                      >
                        <FlaskConical className="h-3 w-3 mr-1" />
                        {isMockBank ? "Test Data" : "Sandbox"}
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="text-xs border-green-500 text-green-700 bg-green-50 dark:bg-green-950/30 dark:text-green-300 shrink-0"
                      >
                        <Wifi className="h-3 w-3 mr-1" />
                        Live
                      </Badge>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="pb-3 space-y-2">
                  {/* Last synced */}
                  <div className="text-sm bg-secondary/50 rounded-md p-3 flex justify-between items-center border">
                    <span className="text-muted-foreground font-medium">Last synced</span>
                    <span className="font-medium">
                      {bank.lastSyncedAt
                        ? format(parseISO(bank.lastSyncedAt), "MMM d, HH:mm")
                        : "Never"}
                    </span>
                  </div>

                  {/* Sandbox explanation */}
                  {sandbox && (
                    <p className="text-xs text-muted-foreground px-1">
                      {isMockBank
                        ? "Using 6 months of realistic UK test transaction data."
                        : "Connected to TrueLayer sandbox environment."}
                    </p>
                  )}
                </CardContent>

                <CardFooter className="pt-2 flex gap-2 border-t bg-muted/20 pb-4">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 font-medium bg-background"
                    onClick={() => triggerSync(true)}
                    disabled={isSyncing}
                  >
                    <RefreshCw className={`mr-2 h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`} />
                    Sync
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
                    onClick={() => handleDelete(bank.id, bank.bankName)}
                    disabled={deleteMutation.isPending && deleteMutation.variables?.id === bank.id}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </CardFooter>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
