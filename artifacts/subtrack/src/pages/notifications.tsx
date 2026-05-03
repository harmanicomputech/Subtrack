import {
  useListNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  getListNotificationsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Bell,
  Ban,
  CreditCard,
  Info,
  Check,
  CheckCheck,
  Landmark,
  Mail,
  CheckCircle2,
  AlertCircle,
  CircleDashed,
  TrendingDown,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { Link } from "wouter";

// ── Icon resolver ─────────────────────────────────────────────────────────────

interface NotificationMeta {
  source?: string;
  confidenceScore?: number;
  merchantName?: string;
  amount?: number;
  billingCycle?: string;
}

function getIcon(type: string, meta?: NotificationMeta | null) {
  switch (type) {
    case "renewal_alert":
      return <CreditCard className="h-5 w-5 text-amber-500" />;
    case "cancellation_update":
      return <Ban className="h-5 w-5 text-blue-500" />;
    case "unused_subscriptions":
      return <TrendingDown className="h-5 w-5 text-orange-500" />;
    case "email_scan_complete":
      return <RefreshCw className="h-5 w-5 text-green-500" />;
    case "new_subscription_detected":
      return meta?.source === "email"
        ? <Mail className="h-5 w-5 text-blue-500" />
        : <Landmark className="h-5 w-5 text-emerald-500" />;
    default:
      return <Info className="h-5 w-5 text-primary" />;
  }
}

function getIconBg(type: string, isUnread: boolean) {
  if (!isUnread) return "bg-secondary border-transparent";
  switch (type) {
    case "renewal_alert":       return "bg-amber-50 border-amber-200";
    case "unused_subscriptions": return "bg-orange-50 border-orange-200";
    case "email_scan_complete": return "bg-green-50 border-green-200";
    case "new_subscription_detected": return "bg-emerald-50 border-emerald-200";
    default:                    return "bg-background shadow-sm";
  }
}

// ── Confidence badge for new subscription detections ─────────────────────────

function ConfidenceBadge({ score }: { score: number }) {
  if (score >= 0.85) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium bg-green-50 text-green-700 border border-green-200">
        <CheckCircle2 className="h-2.5 w-2.5" /> High confidence
      </span>
    );
  }
  if (score >= 0.6) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium bg-amber-50 text-amber-700 border border-amber-200">
        <AlertCircle className="h-2.5 w-2.5" /> Medium confidence
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium bg-muted text-muted-foreground border border-border">
      <CircleDashed className="h-2.5 w-2.5" /> Low confidence
    </span>
  );
}

function SourceBadge({ source }: { source?: string }) {
  if (source === "email") {
    return (
      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 font-normal text-[10px] gap-1 h-auto py-0.5">
        <Mail className="h-2.5 w-2.5" /> Email
      </Badge>
    );
  }
  if (source === "bank") {
    return (
      <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 font-normal text-[10px] gap-1 h-auto py-0.5">
        <Landmark className="h-2.5 w-2.5" /> Bank
      </Badge>
    );
  }
  return null;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Notifications() {
  const { data: notifications, isLoading } = useListNotifications();
  const markReadMutation = useMarkNotificationRead();
  const markAllReadMutation = useMarkAllNotificationsRead();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleMarkRead = (id: number) => {
    markReadMutation.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
        },
      },
    );
  };

  const handleMarkAllRead = () => {
    markAllReadMutation.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
        toast({ title: "Notifications cleared", description: "All notifications marked as read." });
      },
    });
  };

  const hasUnread = notifications?.some((n) => !n.isRead);
  const unreadCount = notifications?.filter((n) => !n.isRead).length ?? 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-3xl mx-auto">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Notifications</h2>
          <p className="text-muted-foreground mt-1">
            Alerts and updates about your account.
            {unreadCount > 0 && (
              <span className="ml-2 inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                {unreadCount}
              </span>
            )}
          </p>
        </div>
        {hasUnread && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleMarkAllRead}
            disabled={markAllReadMutation.isPending}
          >
            <CheckCheck className="h-4 w-4 mr-2" />
            Mark all read
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="p-4 flex items-start gap-4">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2 py-1">
                  <Skeleton className="h-5 w-[200px]" />
                  <Skeleton className="h-4 w-[90%]" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : !notifications || notifications.length === 0 ? (
        <div className="text-center py-20 px-4 border rounded-lg bg-card border-dashed">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-secondary mb-4">
            <Bell className="h-8 w-8 text-muted-foreground opacity-50" />
          </div>
          <h3 className="text-lg font-medium text-foreground mb-1">All caught up</h3>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            You don't have any notifications right now.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((notification) => {
            const meta = (notification as any).metadata as NotificationMeta | null;
            const isNewSub = notification.type === "new_subscription_detected";

            return (
              <Card
                key={notification.id}
                className={`overflow-hidden transition-colors ${
                  !notification.isRead
                    ? "border-primary/30 bg-primary/[0.02]"
                    : "border-transparent bg-card shadow-sm border-muted"
                }`}
              >
                <CardContent className="p-0">
                  <div className="flex items-start p-4 sm:p-5">
                    <div
                      className={`mt-0.5 shrink-0 p-2 rounded-full border ${getIconBg(notification.type, !notification.isRead)}`}
                    >
                      {getIcon(notification.type, meta)}
                    </div>

                    <div className="flex-1 min-w-0 pl-4 pr-4">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h4
                          className={`text-base font-medium ${
                            !notification.isRead ? "text-foreground font-semibold" : "text-foreground/90"
                          }`}
                        >
                          {notification.title}
                        </h4>
                        {!notification.isRead && (
                          <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
                        )}
                      </div>

                      <p
                        className={`text-sm leading-relaxed ${
                          !notification.isRead ? "text-foreground/80" : "text-muted-foreground"
                        }`}
                      >
                        {notification.message}
                      </p>

                      {/* Extra chips for new subscription detections */}
                      {isNewSub && meta && (
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          {meta.source && <SourceBadge source={meta.source} />}
                          {typeof meta.confidenceScore === "number" && (
                            <ConfidenceBadge score={meta.confidenceScore} />
                          )}
                        </div>
                      )}

                      <div className="flex items-center mt-3 gap-3 flex-wrap">
                        <span className="text-xs text-muted-foreground">
                          {format(parseISO(notification.createdAt), "MMM d, h:mm a")}
                        </span>
                        {notification.subscriptionId && (
                          <Button
                            variant="link"
                            size="sm"
                            className="h-auto p-0 text-xs text-primary"
                            asChild
                          >
                            <Link href={`/subscriptions/${notification.subscriptionId}`}>
                              {isNewSub ? "Review subscription" : "View subscription"}
                            </Link>
                          </Button>
                        )}
                      </div>
                    </div>

                    {!notification.isRead && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0 text-muted-foreground hover:text-foreground"
                        onClick={() => handleMarkRead(notification.id)}
                        title="Mark as read"
                      >
                        <Check className="h-5 w-5" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
