import { useState } from "react";
import type { FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { BarChart3, LockKeyhole, Wheat } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { getApiErrorMessage } from "@/services/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate("/", { replace: true });
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="field-pattern grid min-h-screen bg-background lg:grid-cols-[1.15fr_0.85fr]">
      <section className="relative hidden overflow-hidden bg-[#263821] p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(236,184,64,0.22),transparent_28%),radial-gradient(circle_at_80%_12%,rgba(112,154,93,0.26),transparent_32%)]" />
        <div className="relative z-10 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-md bg-accent text-accent-foreground">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div>
            <p className="text-lg font-semibold">AgriTrade</p>
            <p className="text-xs text-white/62">Digital credit and inventory records</p>
          </div>
        </div>

        <div className="relative z-10 max-w-2xl">
          <div className="mb-5 inline-flex items-center gap-2 rounded-md border border-white/15 bg-white/10 px-3 py-1 text-sm text-white/78">
            <Wheat className="h-4 w-4" /> Built for cereal traders in Ghana
          </div>
          <h1 className="max-w-xl text-5xl font-semibold leading-[1.02]">
            Track advances, repayments, and bags without losing the day.
          </h1>
          <div className="mt-8 grid max-w-xl grid-cols-3 gap-3">
            {["Farmer credit", "Stock bags", "Debt records"].map((item) => (
              <div key={item} className="rounded-md border border-white/12 bg-white/8 p-4">
                <p className="text-sm font-medium">{item}</p>
                <p className="mt-1 text-xs text-white/55">Daily ledger ready</p>
              </div>
            ))}
          </div>
        </div>

        <p className="relative z-10 text-sm text-white/55">
          Maize, beans, brown rice, millet, bambara beans, and groundnuts.
        </p>
      </section>

      <section className="flex min-h-screen items-center justify-center p-4 sm:p-8">
        <Card className="w-full max-w-md border-primary/10 shadow-xl shadow-primary/5">
          <CardHeader className="space-y-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-md bg-primary text-primary-foreground lg:hidden">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-2xl">Sign in to AgriTrade</CardTitle>
              <CardDescription>Manage farmer advances, repayments, and inventory.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button type="submit" className="w-full" disabled={submitting}>
                <LockKeyhole className="h-4 w-4" />
                {submitting ? "Signing in..." : "Sign in"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
