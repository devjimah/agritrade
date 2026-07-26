import { Outlet } from "react-router-dom";
import { LogOut, Sprout } from "lucide-react";
import { useFarmerAuth } from "@/context/useFarmerAuth";
import { Button } from "@/components/ui/button";

export function PortalLayout() {
  const { farmer, logout } = useFarmerAuth();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/80 bg-background/92 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Sprout className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold leading-tight">AgriTrade Farmer Portal</p>
              <p className="text-xs text-muted-foreground">{farmer?.fullName}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={logout}>
            <LogOut className="h-4 w-4" /> Log out
          </Button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6 lg:py-8">
        <Outlet />
      </main>
    </div>
  );
}
