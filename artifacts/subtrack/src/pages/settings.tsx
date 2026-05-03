import { useState, useEffect } from "react";
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConnectModal } from "@/components/ConnectModal";
import { ScanResultModal } from "@/components/ScanResultModal";
import {
  Mail,
  RefreshCw,
  CheckCircle2,
  Shield,
  Eye,
  Unlink,
  Loader2,
  Settings,
  AlertTriangle,
  Lock,
  Bell,
} from "lucide-react";
import { format, parseISO } from "date-fns";

interface NotifPrefs {
  emailEnabled: boolean;
  renewalAlerts: boolean;
  insightsAlerts: boolean;
  marketingEmails: boolean;
}

const DEFAULT_PREFS: NotifPrefs = {
  emailEnabled: true,
  renewalAlerts: true,
  insightsAlerts: true,
  marketingEmails: false,
};

export default function SettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showConnectModal, setShowConnectModal] = useState(false);
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);
  const [showResultModal, setShowResultModal] = useState(false);
  const [gmailSyncEnabled, setGmailSyncEnabled] = useState(true);
  const [scanResult, setScanResult] = useState<{
    emailsScanned: number;
    subscriptionsFound: number;
    subscriptionsAdded: number;
    subscriptionsMerged: number;
    duplicatesSkipped: number;
  } | null>(null);

  const { data: gmailStatus, isLoading: statusLoading } = useGetGmailStatus();
  const syncMutation = useSyncGmail();
  const disconnectMutation = useDisconnectGoogle();
  const isConnected = gmailStatus?.connected === true;

  // Notification preferences state
  const [notifPrefs, setNotifPrefs] = useState<NotifPrefs>(DEFAULT_PREFS);
  const [prefsLoading, setPrefsLoading] = useState(true);
  const [prefsSaving, setPrefsSaving] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("subtrack_token");
    if (!token) {
      setPrefsLoading(false);
      return;
    }
    fetch("/api/notifications/preferences", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: NotifPrefs | null) => {
        if (data) {
          setNotifPrefs({
            emailEnabled: data.emailEnabled ?? true,
            renewalAlerts: data.renewalAlerts ?? true,
            insightsAlerts: data.insightsAlerts ?? true,
            marketingEmails: data.marketingEmails ?? false,
          });
        }
      })
      .catch(() => {})
      .finally(() => setPrefsLoading(false));
  }, []);

  const savePrefs = async (updates: Partial<NotifPrefs>) => {
    const merged = { ...notifPrefs, ...updates };
    setNotifPrefs(merged);
    const token = localStorage.getItem("subtrack_token");
    if (!token) return;
    setPrefsSaving(true);
    try {
      const res = await fetch("/api/notifications/preferences", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Failed");
      toast({ title: "Preferences saved" });
    } catch {
      toast({ variant: "destructive", title: "Failed to save preferences", description: "Please try again." });
      setNotifPrefs(notifPrefs);
    } finally {
      setPrefsSaving(false);
    }
  };

  const handleScan = () => {
    syncMutation.mutate(undefined, {
      onSuccess: (data) => {
        setScanResult(data as typeof scanResult);
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
        toast({ variant: "destructive", title: "Scan failed", description: message });
      },
    });
  };

  const handleDisconnect = () => {
    disconnectMutation.mutate(undefined, {
      onSuccess: () => {
        setShowDisconnectDialog(false);
        queryClient.invalidateQueries({ queryKey: getGetGmailStatusQueryKey() });
        toast({ title: "Gmail disconnected", description: "Your Google account has been unlinked." });
      },
      onError: () => {
        toast({ variant: "destructive", title: "Failed to disconnect", description: "Please try again." });
      },
    });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-3xl">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Settings</h2>
        <p className="text-muted-foreground mt-1">
          Manage your connected accounts and detection preferences.
        </p>
      </div>

      {/* Connected Accounts */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold text-foreground">Connected Accounts</h3>
        </div>

        <Card className="shadow-sm">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
                  <Mail className="h-5 w-5 text-red-500" />
                </div>
                <div>
                  <CardTitle className="text-base">Gmail</CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    Automatically detect subscriptions from email receipts and renewals
                  </CardDescription>
                </div>
              </div>
              {!statusLoading && (
                <Badge
                  variant="outline"
                  className={
                    isConnected
                      ? "bg-green-50 text-green-700 border-green-200"
                      : "bg-muted text-muted-foreground border-border"
                  }
                >
                  {isConnected ? "Connected" : "Not connected"}
                </Badge>
              )}
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {statusLoading ? (
              <div className="h-16 animate-pulse bg-muted rounded-lg" />
            ) : isConnected ? (
              <>
                <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Account</span>
                    <span className="font-medium text-foreground">{gmailStatus?.email ?? "—"}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Last scanned</span>
                    <span className="font-medium text-foreground">
                      {gmailStatus?.gmailLastSyncAt
                        ? format(parseISO(gmailStatus.gmailLastSyncAt), "d MMM yyyy, HH:mm")
                        : "Never"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Status</span>
                    <span className="flex items-center gap-1.5 text-green-700 font-medium">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Active
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5 bg-muted/60 rounded-full px-3 py-1">
                    <Eye className="h-3 w-3 text-primary/70" /> Read-only access
                  </span>
                  <span className="flex items-center gap-1.5 bg-muted/60 rounded-full px-3 py-1">
                    <Shield className="h-3 w-3 text-primary/70" /> No email content stored
                  </span>
                  <span className="flex items-center gap-1.5 bg-muted/60 rounded-full px-3 py-1">
                    <Lock className="h-3 w-3 text-primary/70" /> Metadata only
                  </span>
                </div>

                <p className="text-xs text-muted-foreground bg-blue-50/60 border border-blue-100 rounded-md p-3 leading-relaxed">
                  SubTrack only accesses sender names, subjects, and dates — never the body of your
                  emails. No email content is stored on our servers.
                </p>

                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    onClick={handleScan}
                    disabled={syncMutation.isPending || !gmailSyncEnabled}
                    className="flex-1 sm:flex-none"
                  >
                    {syncMutation.isPending ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                        Scanning…
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-3.5 w-3.5 mr-2" />
                        Scan Emails
                      </>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowDisconnectDialog(true)}
                    className="text-muted-foreground hover:text-destructive hover:border-destructive/40"
                  >
                    <Unlink className="h-3.5 w-3.5 mr-2" />
                    Disconnect
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Connect your Gmail account to automatically detect subscriptions from receipts,
                  trials, and renewal emails. We only scan metadata — never your email content.
                </p>
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5 bg-muted/60 rounded-full px-3 py-1">
                    <Eye className="h-3 w-3 text-primary/70" /> Read-only access
                  </span>
                  <span className="flex items-center gap-1.5 bg-muted/60 rounded-full px-3 py-1">
                    <Shield className="h-3 w-3 text-primary/70" /> No content stored
                  </span>
                </div>
                <Button size="sm" onClick={() => setShowConnectModal(true)}>
                  <Mail className="h-3.5 w-3.5 mr-2" />
                  Connect Google Account
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </section>

      <Separator />

      {/* Detection Preferences */}
      <section className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Detection Preferences</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Control how SubTrack finds your subscriptions.
          </p>
        </div>

        <Card className="shadow-sm">
          <CardContent className="divide-y p-0">
            <div className="flex items-center justify-between px-6 py-5">
              <div className="space-y-0.5 pr-4">
                <Label htmlFor="email-detection" className="text-sm font-medium cursor-pointer">
                  Email-based detection
                </Label>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Scan Gmail for receipt and renewal emails to find subscriptions.
                  {!isConnected && (
                    <span className="text-amber-600 ml-1">Connect Gmail to enable this.</span>
                  )}
                </p>
              </div>
              <Switch
                id="email-detection"
                checked={isConnected && gmailSyncEnabled}
                disabled={!isConnected}
                onCheckedChange={(val) => {
                  setGmailSyncEnabled(val);
                  toast({
                    title: val ? "Email detection enabled" : "Email detection paused",
                    description: val
                      ? "Gmail will be used during your next subscription scan."
                      : "Gmail scanning is paused. Your account remains connected.",
                  });
                }}
              />
            </div>

            <div className="flex items-center justify-between px-6 py-5">
              <div className="space-y-0.5 pr-4">
                <Label className="text-sm font-medium">Bank transaction analysis</Label>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Detect recurring payments from your connected bank accounts.
                </p>
              </div>
              <Switch checked={true} disabled />
            </div>
          </CardContent>
        </Card>
      </section>

      <Separator />

      {/* Notification Preferences */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-muted-foreground" />
          <div>
            <h3 className="text-lg font-semibold text-foreground">Notification Preferences</h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              Control which alerts you receive and how they're delivered.
            </p>
          </div>
          {prefsSaving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground ml-auto" />}
        </div>

        <Card className="shadow-sm">
          <CardContent className="divide-y p-0">
            {/* Master email toggle */}
            <div className="flex items-center justify-between px-6 py-5">
              <div className="space-y-0.5 pr-4">
                <Label
                  htmlFor="email-notifications"
                  className="text-sm font-medium cursor-pointer flex items-center gap-2"
                >
                  Email notifications
                  <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    Master
                  </span>
                </Label>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Receive email alerts for important account events. Disabling this turns off all
                  email delivery regardless of other settings.
                </p>
              </div>
              {prefsLoading ? (
                <div className="h-6 w-11 rounded-full bg-muted animate-pulse" />
              ) : (
                <Switch
                  id="email-notifications"
                  checked={notifPrefs.emailEnabled}
                  onCheckedChange={(val) => void savePrefs({ emailEnabled: val })}
                  disabled={prefsSaving}
                />
              )}
            </div>

            {/* Renewal alerts */}
            <div
              className={`flex items-center justify-between px-6 py-5 transition-opacity ${!notifPrefs.emailEnabled ? "opacity-40 pointer-events-none" : ""}`}
            >
              <div className="space-y-0.5 pr-4">
                <Label
                  htmlFor="renewal-alerts"
                  className="text-sm font-medium cursor-pointer"
                >
                  Renewal alerts
                </Label>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Get notified when a subscription is due to renew within 3 days.
                </p>
              </div>
              {prefsLoading ? (
                <div className="h-6 w-11 rounded-full bg-muted animate-pulse" />
              ) : (
                <Switch
                  id="renewal-alerts"
                  checked={notifPrefs.renewalAlerts}
                  onCheckedChange={(val) => void savePrefs({ renewalAlerts: val })}
                  disabled={prefsSaving || !notifPrefs.emailEnabled}
                />
              )}
            </div>

            {/* Insights alerts */}
            <div
              className={`flex items-center justify-between px-6 py-5 transition-opacity ${!notifPrefs.emailEnabled ? "opacity-40 pointer-events-none" : ""}`}
            >
              <div className="space-y-0.5 pr-4">
                <Label
                  htmlFor="insights-alerts"
                  className="text-sm font-medium cursor-pointer"
                >
                  Savings & insights alerts
                </Label>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Get notified when unused subscriptions or potential savings are detected.
                </p>
              </div>
              {prefsLoading ? (
                <div className="h-6 w-11 rounded-full bg-muted animate-pulse" />
              ) : (
                <Switch
                  id="insights-alerts"
                  checked={notifPrefs.insightsAlerts}
                  onCheckedChange={(val) => void savePrefs({ insightsAlerts: val })}
                  disabled={prefsSaving || !notifPrefs.emailEnabled}
                />
              )}
            </div>
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground px-1 leading-relaxed">
          You're receiving these notifications because you have an active SubTrack account. In-app
          notifications are always delivered regardless of email settings.
        </p>
      </section>

      <Separator />

      {/* Privacy & Data */}
      <section className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Privacy & Data</h3>
          <p className="text-sm text-muted-foreground mt-1">How we handle your information.</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {[
            {
              icon: Shield,
              title: "No email content",
              desc: "We only read sender names, subjects, and dates.",
            },
            {
              icon: Lock,
              title: "Encrypted storage",
              desc: "All data is encrypted at rest and in transit.",
            },
            {
              icon: Unlink,
              title: "Disconnect anytime",
              desc: "Remove all connected accounts with one click.",
            },
          ].map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              className="flex gap-3 p-4 rounded-lg bg-muted/40 border border-border/50"
            >
              <Icon className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-foreground">{title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Modals */}
      <ConnectModal open={showConnectModal} onOpenChange={setShowConnectModal} />
      <ScanResultModal open={showResultModal} onOpenChange={setShowResultModal} result={scanResult} />

      <Dialog open={showDisconnectDialog} onOpenChange={setShowDisconnectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Disconnect Gmail?
            </DialogTitle>
            <DialogDescription className="pt-1 leading-relaxed">
              Disconnecting will stop email-based subscription detection. Subscriptions already
              found via email will remain in your account — only future scanning will be disabled.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowDisconnectDialog(false)}>
              Keep connected
            </Button>
            <Button
              variant="destructive"
              onClick={handleDisconnect}
              disabled={disconnectMutation.isPending}
            >
              {disconnectMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Disconnecting…
                </>
              ) : (
                "Disconnect Gmail"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
