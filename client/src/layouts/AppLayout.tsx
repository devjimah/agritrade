import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  BarChart3,
  Boxes,
  ClipboardCheck,
  FileBarChart,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu,
  Mic,
  Sparkles,
  Sprout,
  Users,
  X,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { setAppMode } from "@/lib/appMode";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/farmers", label: "Farmers", icon: Sprout },
  { to: "/customers", label: "Customers", icon: Users },
  { to: "/inventory", label: "Inventory", icon: Boxes },
  { to: "/repayment-claims", label: "Repayment claims", icon: ClipboardCheck },
  { to: "/assistant", label: "Assistant", icon: Sparkles },
  { to: "/ai-proposals", label: "AI proposals", icon: Inbox },
  { to: "/reports", label: "Reports", icon: FileBarChart },
];

/** Brand, nav, and account footer — shared by the desktop sidebar and the mobile drawer. */
function SidebarContent({ onNavigate, onClose }: { onNavigate?: () => void; onClose?: () => void }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <>
      <div className="border-b border-white/10 p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-accent text-accent-foreground">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h1 className="text-lg font-semibold leading-tight">AgriTrade</h1>
            <p className="text-xs text-white/62">Cereal trader desk</p>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-2 text-white/75 hover:bg-white/10 hover:text-white"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              onClick={onNavigate}
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
          onClick={() => {
            setAppMode("lite");
            navigate("/lite", { replace: true });
          }}
          className="mt-3 w-full justify-start text-white/75 hover:bg-white/10 hover:text-white"
        >
          <Mic className="h-4 w-4" /> Simple version (talk)
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={logout}
          className="w-full justify-start text-white/75 hover:bg-white/10 hover:text-white"
        >
          <LogOut className="h-4 w-4" /> Log out
        </Button>
      </div>
    </>
  );
}

export function AppLayout() {
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  // While the drawer is open: Escape closes it and the page behind doesn't scroll.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [menuOpen]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="fixed inset-y-0 left-0 hidden w-64 border-r border-primary/15 bg-[#263821] text-white shadow-2xl shadow-black/10 lg:flex lg:flex-col">
        <SidebarContent />
      </div>

      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMenuOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-[#263821] text-white shadow-2xl">
            <SidebarContent onNavigate={() => setMenuOpen(false)} onClose={() => setMenuOpen(false)} />
          </div>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 border-b border-border/80 bg-background/92 px-4 py-3 backdrop-blur lg:px-8">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 lg:hidden">
              <button
                type="button"
                onClick={() => setMenuOpen(true)}
                className="-ml-1 rounded-md p-2 text-foreground hover:bg-muted"
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <BarChart3 className="h-4 w-4" />
              </div>
              <h1 className="text-base font-semibold leading-tight">AgriTrade</h1>
            </div>
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
            <span className="hidden max-w-44 truncate text-sm text-muted-foreground sm:inline">
              {user?.fullName}
            </span>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
