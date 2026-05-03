import { Link } from "wouter";
import { ShieldAlert } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <ShieldAlert className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-foreground">404 — Page not found</h1>
        <p className="text-muted-foreground mt-2 text-sm">This admin page doesn't exist.</p>
        <Link href="/dashboard" className="mt-6 inline-block text-sm text-primary hover:underline">
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
