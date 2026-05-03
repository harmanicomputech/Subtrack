import { useState } from "react";
import {
  useGetGmailStatus,
  useSyncGmail,
  useDisconnectGoogle,
  getGetGmailStatusQueryKey,
  getListSubscriptionsQueryKey,
  getGetDashboardSummaryQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConnectModal } from "./ConnectModal";
import { ScanResultModal } from "./ScanResultModal";
import {
  Mail,
  RefreshCw,
  CheckCircle2,
  Shield,
  Eye,
  Unlink,
  Loader2,
} from "lucide-react";
import { format, parseISO } from "date-fns";

export function GmailCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [showResultModal, setShowResultModal] = useState(false);
  const [scanResult, setScanResult] = useState<{
    emailsScanned: number;
    subscriptionsFound: number;
    subscriptionsAdded: number;
    duplicatesSkipped: number;
  } | null>(null);

  const { data: gmailStatus, isLoading: statusLoading } = useGetGmailStatus();
  const syncMutation = useSyncGmail();
  const disconnectMutation = useDisconnectGoogle();

  const isConnected = gmailStatus?.connected === true;

  const handleScan = () => {
    syncMutation.mutate(undefined, {
      onSuccess: (data) => {
        setScanResult(data);
        setShowResultModal(true);
        queryClient.invalidateQueries({ queryKey: getGetGmailStatusQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListSubscriptionsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
      },
      onError: (err: unknown) => {
        const message =
          err && typeof err === "object" && "error" in err
            ? String((err as { error: string }).error)
            : "Failed to scan emails. Please try again.";
        toast({
          variant: "destructive",
          title: "Scan failed",
          description: message,
        });
      },
    });
  };

  const handleDisconnect = () => {
    disconnectMutation.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetGmailStatusQueryKey() });
        toast({ title: "Gmail disconnected", description: "Your Google account has been unlinked." });
      },
      onError: () => {
        toast({ variant: "destructive", title: "Failed to disconnect", description: "Please try again." });
      },
    });
  };

  if (statusLoading) {
    return (
      <Card className="border-dashed border-primary/20 shadow-sm animate-pulse">
        <CardContent className="p-5 h-24" />
      </Card>
    );
  }

  if (isConnected) {
    return (
      <>
        <Card className="shadow-sm border-primary/20 bg-primary/3">
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-full bg-green-100 flex items-center justify-center shrink-0 mt-0.5">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-foreground">Gmail connected</p>
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-[10px] font-normal">
                      Active
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {gmailStatus?.email && <span className="font-medium">{gmailStatus.email}</span>}
                    {gmailStatus?.gmailLastSyncAt ? (
                      <span>
                        {gmailStatus?.email ? " · " : ""}
                        Last synced {format(parseISO(gmailStatus.gmailLastSyncAt), "d MMM, HH:mm")}
                      </span>
                    ) : (
                      <span>{gmailStatus?.email ? " · " : ""}Never synced</span>
                    )}
                  </p>
                  <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1"><Eye className="h-2.5 w-2.5" /> Read-only</span>
                    <span className="flex items-center gap-1"><Shield className="h-2.5 w-2.5" /> No content stored</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleDisconnect}
                  disabled={disconnectMutation.isPending}
                  className="text-muted-foreground hover:text-destructive hover:border-destructive/40 h-8 px-3 text-xs"
                >
                  {disconnectMutation.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <><Unlink className="h-3 w-3 mr-1.5" />Disconnect</>
                  )}
                </Button>
                <Button
                  size="sm"
                  onClick={handleScan}
                  disabled={syncMutation.isPending}
                  className="h-8 px-3 text-xs"
                >
                  {syncMutation.isPending ? (
                    <><Loader2 className="h-3 w-3 mr-1.5 animate-spin" />Scanning…</>
                  ) : (
                    <><RefreshCw className="h-3 w-3 mr-1.5" />Scan Emails</>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <ScanResultModal
          open={showResultModal}
          onOpenChange={setShowResultModal}
          result={scanResult}
        />
      </>
    );
  }

  return (
    <>
      <Card className="border-dashed border-primary/30 bg-gradient-to-br from-primary/3 to-background shadow-sm hover:shadow-md transition-shadow">
        <CardContent className="p-5">
          <div className="flex items-start gap-4">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
              <Mail className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">
                Connect Gmail to find hidden subscriptions
              </p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                We scan your inbox for receipts, trials, and renewal emails.{" "}
                <span className="font-medium text-foreground/70">We only read metadata — never your emails.</span>
              </p>
              <div className="flex items-center gap-3 mt-2.5 text-[10px] text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1"><Eye className="h-2.5 w-2.5 text-primary/70" /> Read-only access</span>
                <span className="flex items-center gap-1"><Shield className="h-2.5 w-2.5 text-primary/70" /> No content stored</span>
                <span className="flex items-center gap-1"><Unlink className="h-2.5 w-2.5 text-primary/70" /> Disconnect anytime</span>
              </div>
            </div>
            <Button
              size="sm"
              className="shrink-0 h-8 px-3 text-xs"
              onClick={() => setShowConnectModal(true)}
            >
              Connect Google Account
            </Button>
          </div>
        </CardContent>
      </Card>

      <ConnectModal open={showConnectModal} onOpenChange={setShowConnectModal} />
    </>
  );
}
