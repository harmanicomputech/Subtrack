import { useEffect, useState } from "react";
import { X, Loader2, Calendar, Mail, CreditCard, Landmark, Activity } from "lucide-react";
import { getAdminUser, type AdminUserDetail } from "@/lib/admin-api";

interface UserDetailDrawerProps {
  userId: number | null;
  onClose: () => void;
}

export function UserDetailDrawer({ userId, onClose }: UserDetailDrawerProps) {
  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    getAdminUser(userId)
      .then(setUser)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load user"))
      .finally(() => setLoading(false));
  }, [userId]);

  if (!userId) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/50 z-40 md:hidden"
        onClick={onClose}
      />
      {/* Drawer */}
      <div className="fixed right-0 top-0 h-screen w-full md:w-96 bg-card border-l border-border z-50 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-foreground">User Details</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-muted rounded-md"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="p-5 text-sm text-destructive">{error}</div>
          ) : user ? (
            <div className="p-5 space-y-5">
              {/* Summary */}
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-foreground truncate">{user.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-muted/50 rounded p-2">
                    <p className="text-muted-foreground">Plan</p>
                    <p className="font-medium text-foreground capitalize">{user.subscriptionStatus}</p>
                  </div>
                  <div className="bg-muted/50 rounded p-2">
                    <p className="text-muted-foreground">ID</p>
                    <p className="font-mono text-foreground">{user.id}</p>
                  </div>
                  <div className="bg-muted/50 rounded p-2 col-span-2">
                    <p className="text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> Joined
                    </p>
                    <p className="font-medium text-foreground">
                      {new Date(user.createdAt).toLocaleDateString("en-GB")}
                    </p>
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div className="h-px bg-border" />

              {/* Subscriptions */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-foreground flex items-center gap-2">
                  <CreditCard className="h-4 w-4" /> Subscriptions
                </h3>
                {user.subscriptionCount > 0 ? (
                  <div className="text-xs space-y-1">
                    <p className="text-muted-foreground">Total: <span className="font-semibold text-foreground">{user.subscriptionCount}</span></p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No subscriptions</p>
                )}
              </div>

              {/* Divider */}
              <div className="h-px bg-border" />

              {/* Notifications */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-foreground flex items-center gap-2">
                  <Activity className="h-4 w-4" /> Activity
                </h3>
                <div className="text-xs space-y-1">
                  <p><span className="text-muted-foreground">Notifications:</span> <span className="font-semibold text-foreground">{user.notificationCount}</span></p>
                  {user.gmailLastSyncAt && (
                    <p><span className="text-muted-foreground">Gmail synced:</span> <span className="font-medium text-foreground">{new Date(user.gmailLastSyncAt).toLocaleDateString("en-GB")}</span></p>
                  )}
                </div>
              </div>

              {/* Divider */}
              <div className="h-px bg-border" />

              {/* Billing */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-foreground flex items-center gap-2">
                  <CreditCard className="h-4 w-4" /> Billing
                </h3>
                <div className="text-xs space-y-1">
                  {user.billingProvider ? (
                    <>
                      <p><span className="text-muted-foreground">Provider:</span> <span className="font-semibold text-foreground capitalize">{user.billingProvider}</span></p>
                      {user.paymentReference && (
                        <p><span className="text-muted-foreground">Reference:</span> <span className="font-mono text-foreground text-[10px]">{user.paymentReference}</span></p>
                      )}
                    </>
                  ) : (
                    <p className="text-muted-foreground">No billing provider</p>
                  )}
                </div>
              </div>

              {/* Divider */}
              <div className="h-px bg-border" />

              {/* Bank Connection */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-foreground flex items-center gap-2">
                  <Landmark className="h-4 w-4" /> Bank Connection
                </h3>
                <div className="text-xs">
                  <p className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${user.stripeCustomerId ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                    {user.stripeCustomerId ? "Connected" : "Not connected"}
                  </p>
                </div>
              </div>

              {/* Google */}
              {user.googleId && (
                <>
                  <div className="h-px bg-border" />
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold text-foreground flex items-center gap-2">
                      <Mail className="h-4 w-4" /> Google
                    </h3>
                    <p className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
                      Connected
                    </p>
                  </div>
                </>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
