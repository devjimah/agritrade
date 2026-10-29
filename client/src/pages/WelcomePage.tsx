import { useNavigate } from "react-router-dom";
import { ChevronRight, LayoutDashboard, Mic, Volume2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { setAppMode } from "@/lib/appMode";
import type { AppMode } from "@/lib/appMode";
import { cn } from "@/lib/utils";

const CHOICES: {
  mode: AppMode;
  icons: LucideIcon[];
  title: string;
  body: string;
  tone: string;
}[] = [
  {
    mode: "lite",
    icons: [Mic, Volume2],
    title: "Simple",
    body: "Talk to the assistant. It talks back. Big buttons.",
    tone: "border-primary bg-primary text-primary-foreground",
  },
  {
    mode: "full",
    icons: [LayoutDashboard],
    title: "Full",
    body: "All records: farmers, customers, stock and reports.",
    tone: "border-border bg-card text-foreground",
  },
];

/** Shown once per phone after sign-in: pick the simple (talk) or full version. */
export function WelcomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  function choose(mode: AppMode) {
    setAppMode(mode);
    navigate(mode === "lite" ? "/lite" : "/", { replace: true });
  }

  return (
    <div className="field-pattern flex min-h-dvh flex-col bg-background px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-10">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
        <p className="text-lg text-muted-foreground">
          Welcome{user?.fullName ? `, ${user.fullName.split(" ")[0]}` : ""}
        </p>
        <h1 className="mt-1 text-3xl font-semibold leading-tight">How do you want to use AgriTrade?</h1>

        <div className="mt-8 space-y-4">
          {CHOICES.map(({ mode, icons, title, body, tone }) => (
            <button
              key={mode}
              type="button"
              onClick={() => choose(mode)}
              className={cn(
                "flex w-full items-center gap-4 rounded-3xl border-2 p-5 text-left shadow-sm transition active:scale-[0.98]",
                tone
              )}
            >
              <div className="flex shrink-0 -space-x-3">
                {icons.map((Icon, i) => (
                  <span
                    key={i}
                    className={cn(
                      "flex h-16 w-16 items-center justify-center rounded-full ring-4",
                      mode === "lite"
                        ? "bg-white/15 ring-primary"
                        : "bg-primary/10 text-primary ring-card"
                    )}
                  >
                    <Icon className="h-8 w-8" />
                  </span>
                ))}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-2xl font-bold">{title}</p>
                <p className={cn("mt-1 text-base", mode === "lite" ? "text-white/85" : "text-muted-foreground")}>
                  {body}
                </p>
              </div>
              <ChevronRight className="h-6 w-6 shrink-0 opacity-70" />
            </button>
          ))}
        </div>

        <p className="mt-auto pt-8 text-center text-sm text-muted-foreground">
          You can change this later from the menu.
        </p>
      </div>
    </div>
  );
}
