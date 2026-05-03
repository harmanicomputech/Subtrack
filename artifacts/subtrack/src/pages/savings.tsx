import { useListSavings } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { format, parseISO } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PiggyBank, TrendingUp, Calendar as CalendarIcon, Lock, ArrowRight, Sparkles } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from "recharts";
import { isProFeatureAllowed, trackBillingEvent } from "@/lib/billing";

// ── Pro gate overlay ──────────────────────────────────────────────────────────

function ProGateOverlay() {
  const [, setLocation] = useLocation();

  const handleUpgrade = () => {
    trackBillingEvent("upgrade_prompt_clicked", "from_savings_insights");
    setLocation("/onboarding?step=checkout");
  };

  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-lg backdrop-blur-sm bg-background/80 border border-primary/20">
      <div className="flex flex-col items-center gap-3 text-center px-6 max-w-xs">
        <div className="h-11 w-11 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
          <Lock className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="text-sm font-bold text-foreground">Unlock full savings insights</p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            Detailed projections and breakdowns are available on Recuris Pro.
          </p>
        </div>
        <Button size="sm" className="font-semibold" onClick={handleUpgrade}>
          <Sparkles className="mr-1.5 h-3.5 w-3.5" />
          Upgrade to Pro — £4/mo
          <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Savings() {
  const { data: savings, isLoading } = useListSavings();
  const proAllowed = isProFeatureAllowed();

  const formatCurrency = (amount: number, currency: string = "GBP") => {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount);
  };

  const totalSaved = savings?.reduce((sum, record) => sum + record.amountSaved, 0) || 0;
  
  const monthlyData = savings?.reduce((acc: any[], record) => {
    const month = format(parseISO(record.savedAt), 'MMM yyyy');
    const existing = acc.find(item => item.name === month);
    if (existing) {
      existing.value += record.amountSaved;
    } else {
      acc.push({ name: month, value: record.amountSaved });
    }
    return acc;
  }, []) || [];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Savings</h2>
        <p className="text-muted-foreground mt-1">See how much money you've kept in your pocket.</p>
      </div>

      {/* Upgrade notice banner for limited users */}
      {!proAllowed && (
        <div className="rounded-xl border border-amber-200/70 bg-gradient-to-br from-amber-50/40 to-background px-5 py-4 flex items-center justify-between gap-4 animate-in fade-in duration-500">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-full bg-amber-100 border border-amber-200 flex items-center justify-center shrink-0">
              <Sparkles className="h-4 w-4 text-amber-600" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">Full savings insights are a Pro feature</p>
              <p className="text-xs text-muted-foreground leading-snug">Upgrade to unlock detailed projections and monthly breakdowns.</p>
            </div>
          </div>
          <Button
            size="sm"
            className="shrink-0"
            onClick={() => {
              trackBillingEvent("upgrade_prompt_clicked", "from_savings_banner");
              window.location.href = "/onboarding?step=checkout";
            }}
          >
            Upgrade — £4/mo
          </Button>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-3">
        {/* Total Saved — always visible as a teaser */}
        <Card className="shadow-sm border-primary/20 bg-primary/5 md:col-span-1 relative overflow-hidden">
          <div className="absolute -right-6 -top-6 opacity-10">
            <PiggyBank className="w-32 h-32 text-primary" />
          </div>
          <CardHeader className="pb-2">
            <CardTitle className="text-primary font-medium flex items-center">
              <TrendingUp className="h-5 w-5 mr-2" /> Total Saved
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-12 w-[150px]" />
            ) : (
              <div>
                <div className="text-5xl font-extrabold text-primary tracking-tight">
                  {formatCurrency(totalSaved)}
                </div>
                <p className="text-sm text-primary/70 mt-2 font-medium">
                  Across {savings?.length || 0} cancelled subscriptions
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Chart — gated for limited users */}
        <div className="relative md:col-span-2">
          <Card className={`shadow-sm border-muted h-full ${!proAllowed ? "overflow-hidden" : ""}`}>
            <CardHeader>
              <CardTitle>Savings over time</CardTitle>
              <CardDescription>Monthly breakdown of money saved</CardDescription>
            </CardHeader>
            <CardContent className="h-[200px]">
              {isLoading ? (
                <Skeleton className="h-full w-full" />
              ) : monthlyData.length === 0 ? (
                <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                  Cancel your first subscription to start seeing savings here.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyData}>
                    <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis
                      tickFormatter={(val) => `£${val}`}
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      formatter={(value: number) => [formatCurrency(value), 'Saved']}
                      cursor={{ fill: 'hsl(var(--muted))' }}
                      contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))' }}
                    />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {monthlyData.map((_: any, index: number) => (
                        <Cell key={`cell-${index}`} fill="hsl(var(--chart-3))" />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
          {!proAllowed && <ProGateOverlay />}
        </div>
      </div>

      {/* Detailed breakdown — gated for limited users */}
      <div className="relative">
        <Card className="shadow-sm border-muted">
          <CardHeader>
            <CardTitle>Detailed Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-4">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : !savings || savings.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <PiggyBank className="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p>No savings recorded yet.</p>
              </div>
            ) : (
              <div className="divide-y">
                {savings.map((record) => (
                  <div key={record.id} className="p-4 flex items-center justify-between hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                        <TrendingUp className="h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-foreground">{record.subscriptionName}</h4>
                        <div className="flex items-center text-xs text-muted-foreground mt-0.5">
                          <CalendarIcon className="h-3 w-3 mr-1" />
                          Saved on {format(parseISO(record.savedAt), 'MMM d, yyyy')}
                        </div>
                      </div>
                    </div>
                    <div className="text-right font-bold text-lg text-emerald-600">
                      +{formatCurrency(record.amountSaved, record.currency)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        {!proAllowed && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-lg backdrop-blur-sm bg-background/80 border border-primary/20">
            <div className="flex flex-col items-center gap-3 text-center px-6 max-w-xs">
              <div className="h-11 w-11 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Lock className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">Detailed breakdown is a Pro feature</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  See every cancelled subscription and exactly how much you've saved with Pro.
                </p>
              </div>
              <Button
                size="sm"
                className="font-semibold"
                onClick={() => {
                  trackBillingEvent("upgrade_prompt_clicked", "from_savings_breakdown");
                  window.location.href = "/onboarding?step=checkout";
                }}
              >
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                Upgrade to Pro — £4/mo
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
