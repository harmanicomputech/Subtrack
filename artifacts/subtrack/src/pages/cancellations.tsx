import { useListCancellations, useUpdateCancellation, getListCancellationsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { format, parseISO } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Ban, CheckCircle2, Clock, Mail, ShieldAlert, CreditCard, XCircle, Lock, ArrowRight, Sparkles } from "lucide-react";
import { isProFeatureAllowed, trackBillingEvent } from "@/lib/billing";

// ── Inline Pro gate ───────────────────────────────────────────────────────────

function CancellationsProGate() {
  const [, setLocation] = useLocation();

  const handleUpgrade = () => {
    trackBillingEvent("upgrade_prompt_clicked", "from_cancellations_page");
    setLocation("/onboarding?step=checkout");
  };

  return (
    <div className="rounded-xl border border-amber-200/70 bg-gradient-to-br from-amber-50/50 to-background p-6 space-y-4 animate-in fade-in duration-500">
      <div className="flex items-start gap-4">
        <div className="h-11 w-11 rounded-full bg-amber-100 border-2 border-amber-200 flex items-center justify-center shrink-0">
          <Lock className="h-5 w-5 text-amber-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-base font-bold text-foreground">Cancellation tools are part of Pro</p>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
            Upgrade to SubTrack Pro to track, manage, and automate subscription cancellations directly from your dashboard.
          </p>
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        {[
          { icon: Ban, label: "Track cancellation requests" },
          { icon: Mail, label: "Automated email cancellations" },
          { icon: ShieldAlert, label: "Direct debit blocking" },
        ].map(({ icon: Icon, label }) => (
          <div key={label} className="flex items-center gap-2 text-sm text-muted-foreground bg-white border border-amber-100 rounded-lg px-3 py-2.5">
            <Icon className="h-4 w-4 text-amber-600 shrink-0" />
            <span>{label}</span>
          </div>
        ))}
      </div>

      <Button className="w-full sm:w-auto h-11 font-semibold" onClick={handleUpgrade}>
        <Sparkles className="mr-2 h-4 w-4" />
        Upgrade to Pro — £4/month
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Cancellations() {
  const { data: cancellations, isLoading } = useListCancellations();
  const updateMutation = useUpdateCancellation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const proAllowed = isProFeatureAllowed();

  const handleUpdateStatus = (id: number, status: string) => {
    updateMutation.mutate(
      { id, data: { status } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListCancellationsQueryKey() });
          toast({
            title: "Request updated",
            description: `Cancellation marked as ${status}.`,
          });
        },
        onError: () => {
          toast({
            variant: "destructive",
            title: "Update failed",
            description: "Could not update the cancellation request.",
          });
        }
      }
    );
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'sent': return <Mail className="h-5 w-5 text-blue-500" />;
      case 'failed': return <XCircle className="h-5 w-5 text-destructive" />;
      case 'pending': default: return <Clock className="h-5 w-5 text-amber-500" />;
    }
  };

  const getMethodInfo = (method: string) => {
    switch (method) {
      case 'direct_debit': return { label: 'Bank Block', icon: ShieldAlert, color: 'text-primary' };
      case 'email': return { label: 'Email Request', icon: Mail, color: 'text-blue-500' };
      case 'manual': default: return { label: 'Manual Action', icon: CreditCard, color: 'text-muted-foreground' };
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Cancellations</h2>
        <p className="text-muted-foreground mt-1">Track the status of your cancellation requests.</p>
      </div>

      {/* Pro gate — inline, non-blocking. Replaces list for skipped users. */}
      {!proAllowed ? (
        <CancellationsProGate />
      ) : isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <Card key={i} className="overflow-hidden">
              <CardContent className="p-6">
                <div className="flex items-center">
                  <Skeleton className="h-10 w-10 rounded-full mr-4" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-5 w-[150px]" />
                    <Skeleton className="h-4 w-[100px]" />
                  </div>
                  <Skeleton className="h-8 w-[100px]" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : !cancellations || cancellations.length === 0 ? (
        <div className="text-center py-16 px-4 border rounded-lg bg-card border-dashed">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-secondary mb-4">
            <Ban className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium text-foreground mb-1">No cancellations yet</h3>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            When you request to cancel a subscription, tracking details will appear here.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {cancellations.map((req) => {
            const methodInfo = getMethodInfo(req.method);
            const MethodIcon = methodInfo.icon;
            
            return (
              <Card key={req.id} className="overflow-hidden shadow-sm border-muted">
                <div className="flex flex-col sm:flex-row">
                  <div className="p-5 flex-1 flex items-start gap-4">
                    <div className="mt-0.5 shrink-0 bg-secondary/50 p-2 rounded-full border">
                      {getStatusIcon(req.status)}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-lg font-semibold text-foreground">{req.subscriptionName}</h4>
                        <Badge variant="outline" className={`capitalize font-normal text-xs ${
                          req.status === 'completed' ? 'bg-green-50 text-green-700 border-green-200' : 
                          req.status === 'failed' ? 'bg-red-50 text-red-700 border-red-200' :
                          req.status === 'sent' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                          'bg-amber-50 text-amber-700 border-amber-200'
                        }`}>
                          {req.status}
                        </Badge>
                      </div>
                      
                      <div className="flex items-center text-sm text-muted-foreground gap-4 mt-2">
                        <div className="flex items-center">
                          <MethodIcon className={`h-4 w-4 mr-1.5 ${methodInfo.color}`} />
                          <span>{methodInfo.label}</span>
                        </div>
                        <div className="flex items-center border-l pl-4">
                          <Clock className="h-4 w-4 mr-1.5 opacity-60" />
                          <span>Requested {format(parseISO(req.createdAt), 'MMM d, yyyy')}</span>
                        </div>
                      </div>
                      
                      {req.notes && (
                        <div className="mt-3 text-sm bg-muted/30 p-3 rounded-md border border-muted/50 text-muted-foreground">
                          {req.notes}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="bg-muted/10 p-5 sm:w-64 border-t sm:border-t-0 sm:border-l flex flex-row sm:flex-col items-center sm:items-stretch justify-end gap-2">
                    {req.status === 'pending' && req.method === 'manual' && (
                      <Button size="sm" onClick={() => handleUpdateStatus(req.id, 'completed')} className="w-full">
                        Mark Completed
                      </Button>
                    )}
                    {req.status === 'pending' && req.method !== 'manual' && (
                      <div className="text-sm text-center text-muted-foreground w-full">
                        Processing request...
                      </div>
                    )}
                    {req.status === 'sent' && (
                      <>
                        <Button size="sm" onClick={() => handleUpdateStatus(req.id, 'completed')} className="w-full">
                          Confirm Cancelled
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleUpdateStatus(req.id, 'failed')} className="w-full mt-2">
                          Failed
                        </Button>
                      </>
                    )}
                    {req.status === 'completed' && (
                      <div className="text-sm font-medium text-center text-green-600 flex items-center justify-center w-full h-full">
                        <CheckCircle2 className="h-4 w-4 mr-2" /> Cancelled successfully
                      </div>
                    )}
                    {req.status === 'failed' && (
                      <div className="text-sm font-medium text-center text-destructive flex items-center justify-center w-full h-full">
                        <XCircle className="h-4 w-4 mr-2" /> Cancellation failed
                      </div>
                    )}
                  </div>
                </div>
            </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
