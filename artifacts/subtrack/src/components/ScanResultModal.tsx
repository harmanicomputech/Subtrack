import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Mail, CheckCircle2, CreditCard } from "lucide-react";
import { Link } from "wouter";

interface ScanResult {
  emailsScanned: number;
  subscriptionsFound: number;
  subscriptionsAdded: number;
  duplicatesSkipped: number;
}

interface ScanResultModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: ScanResult | null;
}

export function ScanResultModal({ open, onOpenChange, result }: ScanResultModalProps) {
  if (!result) return null;

  const hasNew = result.subscriptionsAdded > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${hasNew ? "bg-primary/10" : "bg-secondary"}`}>
              {hasNew ? (
                <CheckCircle2 className="h-5 w-5 text-primary" />
              ) : (
                <Mail className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <DialogTitle className="text-xl">
              {hasNew
                ? `Found ${result.subscriptionsAdded} new subscription${result.subscriptionsAdded === 1 ? "" : "s"}`
                : "Scan complete"}
            </DialogTitle>
          </div>
          <DialogDescription className="text-sm text-muted-foreground">
            {hasNew
              ? `We scanned ${result.emailsScanned} emails and detected ${result.subscriptionsFound} subscription${result.subscriptionsFound === 1 ? "" : "s"}.`
              : `We scanned ${result.emailsScanned} emails but didn't find any new subscriptions beyond what you're already tracking.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-lg bg-secondary/60 text-center">
              <p className="text-2xl font-bold text-foreground">{result.emailsScanned}</p>
              <p className="text-xs text-muted-foreground mt-1">Emails scanned</p>
            </div>
            <div className="p-3 rounded-lg bg-secondary/60 text-center">
              <p className="text-2xl font-bold text-primary">{result.subscriptionsAdded}</p>
              <p className="text-xs text-muted-foreground mt-1">New found</p>
            </div>
            <div className="p-3 rounded-lg bg-secondary/60 text-center">
              <p className="text-2xl font-bold text-foreground">{result.duplicatesSkipped}</p>
              <p className="text-xs text-muted-foreground mt-1">Already tracked</p>
            </div>
          </div>

          {hasNew && (
            <div className="p-3 rounded-lg border border-primary/20 bg-primary/5">
              <div className="flex items-center gap-2 mb-2">
                <CreditCard className="h-4 w-4 text-primary" />
                <p className="text-sm font-medium text-foreground">Newly added to your list</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: Math.min(result.subscriptionsAdded, 5) }).map((_, i) => (
                  <Badge
                    key={i}
                    variant="outline"
                    className="bg-background text-xs font-normal"
                  >
                    <Mail className="h-2.5 w-2.5 mr-1 text-primary" />
                    Detected via email
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground text-center">
            Only metadata was accessed. No email content was read or stored.
          </p>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
          <Button
            variant="outline"
            className="sm:flex-1"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
          {hasNew && (
            <Button className="sm:flex-1" asChild onClick={() => onOpenChange(false)}>
              <Link href="/subscriptions">Review Subscriptions</Link>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
