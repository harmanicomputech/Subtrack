import { useState, useEffect } from "react";
import { Link, useLocation, Redirect } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useGetMe, useListNotifications } from "@workspace/api-client-react";
import { RecurisLogo } from "@/components/RecurisLogo";
import {
  LayoutDashboard,
  CreditCard,
  Landmark,
  Receipt,
  Ban,
  PiggyBank,
  Bell,
  Settings,
  LogOut,
  Menu,
  BadgeDollarSign,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Subscriptions", href: "/subscriptions", icon: CreditCard },
  { name: "Bank Accounts", href: "/bank-accounts", icon: Landmark },
  { name: "Transactions", href: "/transactions", icon: Receipt },
  { name: "Cancellations", href: "/cancellations", icon: Ban },
  { name: "Savings", href: "/savings", icon: PiggyBank },
  { name: "Notifications", href: "/notifications", icon: Bell },
  { name: "Subscription", href: "/subscription", icon: BadgeDollarSign },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { logout, isAuthenticated } = useAuth();

  const { data: user, error: meError } = useGetMe({
    query: { enabled: isAuthenticated, queryKey: ["getMe"] },
  });

  const { data: notifications } = useListNotifications({
    query: {
      enabled: isAuthenticated,
      refetchInterval: 30_000,
      queryKey: ["notifications"],
    },
  });

  const unreadCount = notifications?.filter((n) => !n.isRead).length ?? 0;

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location]);

  useEffect(() => {
    if (!meError) return;
    const status =
      (meError as any)?.status ??
      (meError as any)?.statusCode ??
      (meError as any)?.response?.status;
    if (status === 401) {
      localStorage.removeItem("recuris_token");
      window.dispatchEvent(new Event("storage"));
    }
  }, [meError]);

  if (!isAuthenticated) {
    return <Redirect to="/login" />;
  }

  const NavLinks = () => (
    <>
      <div className="px-4 py-6">
        <RecurisLogo size={32} showWordmark wordmarkClass="text-xl" />
        <p className="text-xs text-muted-foreground mt-2 font-medium">Financial Co-pilot</p>
      </div>
      <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
        {navigation.map((item) => {
          const isActive = location === item.href || location.startsWith(`${item.href}/`);
          const isNotifications = item.href === "/notifications";
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center px-3 py-2.5 text-sm font-medium rounded-md transition-colors group",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              <item.icon
                className={cn(
                  "mr-3 h-5 w-5 flex-shrink-0 transition-colors",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground group-hover:text-foreground",
                )}
                aria-hidden="true"
              />
              {item.name}
              {isNotifications && unreadCount > 0 && (
                <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground leading-none">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="p-4 border-t">
        <div className="flex items-center px-3 mb-4">
          <div className="flex-shrink-0">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
              {user?.name?.charAt(0).toUpperCase() ?? "U"}
            </div>
          </div>
          <div className="ml-3 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{user?.name ?? "—"}</p>
            <p className="text-xs text-muted-foreground truncate">{user?.email ?? ""}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start text-muted-foreground hover:text-foreground"
          onClick={logout}
        >
          <LogOut className="mr-3 h-5 w-5" />
          Sign out
        </Button>
      </div>
    </>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Mobile sidebar */}
      <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
        <SheetContent side="left" className="w-72 p-0 flex flex-col bg-card">
          <NavLinks />
        </SheetContent>
      </Sheet>

      {/* Desktop sidebar */}
      <div className="hidden md:flex md:flex-shrink-0">
        <div className="flex flex-col w-64 border-r bg-card h-full">
          <NavLinks />
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-col w-0 flex-1 overflow-hidden">
        <div className="md:hidden flex items-center justify-between px-4 py-3 border-b bg-card">
          <div className="flex items-center gap-2">
            <RecurisLogo size={28} showWordmark wordmarkClass="text-lg" />
            {unreadCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground leading-none">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={() => setIsMobileMenuOpen(true)}>
            <Menu className="h-6 w-6" />
          </Button>
        </div>
        <main className="flex-1 relative z-0 overflow-y-auto focus:outline-none">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
