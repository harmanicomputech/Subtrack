import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex h-[80vh] flex-col items-center justify-center text-center space-y-6">
      <div className="space-y-2">
        <h1 className="text-6xl font-bold tracking-tighter text-primary">404</h1>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">Page not found</h2>
        <p className="text-muted-foreground max-w-[500px] mx-auto">
          We couldn't find the page you're looking for. It might have been moved, deleted, or you might have mistyped the URL.
        </p>
      </div>
      <Button asChild size="lg">
        <Link href="/dashboard">Back to Dashboard</Link>
      </Button>
    </div>
  );
}
