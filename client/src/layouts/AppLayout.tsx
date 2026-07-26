import { NavLink, Outlet } from "react-router-dom";
import {
  BarChart3,
  Boxes,
  ClipboardCheck,
  FileBarChart,
  LayoutDashboard,
  LogOut,
  Sprout,
  Users,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/farmers", label: "Farmers", icon: Sprout },
  { to: "/customers", label: "Customers", icon: Users },
  { to: "/inventory", label: "Inventory", icon: Boxes },
  { to: "/repayment-claims", label: "Repayment claims", icon: ClipboardCheck },
  { to: "/reports", label: "Reports", icon: FileBarChart },
];

export function AppLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="fixed inset-y-0 left-0 hidden w-64 border-r border-primary/15 bg-[#263821] text-white shadow-2xl shadow-black/10 lg:flex lg:flex-col">
        <div className="border-b border-white/10 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-accent text-accent-foreground">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold leading-tight">AgriTrade</h1>
              <p className="text-xs text-white/62">Cereal trader desk</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition",
                    isActive
                      ? "bg-white text-[#263821] shadow-sm"
                      : "text-white/72 hover:bg-white/10 hover:text-white"
                  )
                }
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-4">
          <p className="text-xs uppercase text-white/45">Signed in</p>
          <p className="mt-1 truncate text-sm font-medium">{user?.fullName || "Trader"}</p>
          <Button
            variant="ghost"
            size="sm"
            onClick={logout}
            className="mt-3 w-full justify-start text-white/75 hover:bg-white/10 hover:text-white"
          >
            <LogOut className="h-4 w-4" /> Log out
          </Button>
        </div>
      </div>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 border-b border-border/80 bg-background/92 px-4 py-3 backdrop-blur lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 lg:hidden">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <BarChart3 className="h-4 w-4" />
              </div>
              <div>
                <h1 className="text-base font-semibold leading-tight">AgriTrade</h1>
                <p className="text-xs text-muted-foreground">Cereal trader desk</p>
              </div>
            </div>
            <nav className="flex w-full gap-1 overflow-x-auto lg:hidden">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/"}
                  className={({ isActive }) =>
                    cn(
                      "flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted"
                    )
                  }
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </NavLink>
              );
            })}
          </nav>
            <div className="hidden lg:block">
              <p className="text-xs font-medium uppercase text-muted-foreground">Today</p>
              <p className="text-sm font-semibold">
                {new Intl.DateTimeFormat("en-GH", {
                  weekday: "long",
                  month: "short",
                  day: "numeric",
                }).format(new Date())}
              </p>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <span className="hidden max-w-44 truncate text-muted-foreground sm:inline">
                {user?.fullName}
              </span>
              <Button variant="outline" size="sm" onClick={logout} className="lg:hidden">
                <LogOut className="h-4 w-4" /> Log out
              </Button>
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
