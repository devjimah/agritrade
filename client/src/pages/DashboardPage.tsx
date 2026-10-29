import { useEffect, useState } from "react";
import type { ComponentType } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Boxes, CircleDollarSign, Sprout, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CROP_LABELS } from "@/lib/crops";
import { formatGHS } from "@/lib/money";
import { getApiErrorMessage } from "@/services/api";
import { listAdvances } from "@/services/advances";
import type { Advance } from "@/services/advances";
import { getDashboardReport } from "@/services/reports";
import type { DashboardReport } from "@/services/reports";

export function DashboardPage() {
  const [report, setReport] = useState<DashboardReport | null>(null);
  const [advances, setAdvances] = useState<Advance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [reportData, advanceData] = await Promise.all([
          getDashboardReport(),
          listAdvances({ page: 1, limit: 6 }),
        ]);
        if (cancelled) return;
        setReport(reportData);
        setAdvances(advanceData.advances);
      } catch (err) {
        if (!cancelled) setError(getApiErrorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // All figures below come from the server-side report aggregation — never
  // computed client-side over a paginated slice.
  const inventory = report?.inventory ?? [];
  const totalBags = inventory.reduce((sum, item) => sum + item.quantityBags, 0);

  // Six crops max — sorting on render is cheaper than memo bookkeeping.
  const strongestStock = [...inventory]
    .sort((a, b) => b.quantityBags - a.quantityBags)
    .slice(0, 3);

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-lg border border-primary/10 bg-card shadow-sm">
        <div className="grid gap-0 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="p-5 sm:p-7">
            <p className="text-sm font-medium uppercase text-primary">Operations snapshot</p>
            <h2 className="mt-2 max-w-2xl text-2xl font-semibold leading-tight sm:text-3xl">
              Know which farmers owe bags and which cereals are ready to sell.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              This desk reflects the modules already active in the MVP: farmer records, advances,
              repayments, and stock balances.
            </p>
          </div>
          <div className="grid grid-cols-3 border-t bg-primary/5 lg:border-l lg:border-t-0">
            {strongestStock.length === 0 ? (
              <div className="col-span-3 flex items-center justify-center p-6 text-sm text-muted-foreground">
                Stock movements will appear here after repayments.
              </div>
            ) : (
              strongestStock.map((item) => (
                <div key={item.cropType} className="border-r border-primary/10 p-4 last:border-r-0">
                  <p className="text-xs text-muted-foreground">{CROP_LABELS[item.cropType]}</p>
                  <p className="mt-2 text-2xl font-semibold">{item.quantityBags}</p>
                  <p className="text-xs text-muted-foreground">bags</p>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      {error && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Sprout}
          label="Farmers / Customers"
          value={
            loading || !report ? "--" : `${report.counts.farmers} / ${report.counts.customers}`
          }
        />
        <MetricCard
          icon={TrendingUp}
          label="Outstanding farmer advances"
          value={loading || !report ? "--" : formatGHS(report.outstandingAdvances)}
        />
        <MetricCard icon={Boxes} label="Bags in stock" value={loading ? "--" : totalBags} />
        <MetricCard
          icon={CircleDollarSign}
          label="Outstanding customer debt"
          value={loading || !report ? "--" : formatGHS(report.outstandingDebt)}
        />
      </section>

      {report && (
        <p className="text-sm text-muted-foreground">
          Today: {report.today.salesCount} sale(s) worth {formatGHS(report.today.salesValue)} ·{" "}
          {report.today.paymentsCount} payment(s) of {formatGHS(report.today.paymentsValue)} ·{" "}
          {report.today.repaymentBags} bag(s) received from farmers
        </p>
      )}

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Latest advances</CardTitle>
            <Link to="/farmers" className="inline-flex items-center gap-1 text-sm font-medium text-primary">
              Farmers <ArrowRight className="h-4 w-4" />
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <p className="p-6 text-sm text-muted-foreground">Loading...</p>
            ) : advances.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">No advances recorded yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Farmer</TableHead>
                    <TableHead className="hidden sm:table-cell">Crop</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead className="hidden sm:table-cell">Bags</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {advances.map((advance) => (
                    <TableRow key={advance._id}>
                      <TableCell className="font-medium">
                        {typeof advance.farmerId === "string" ? "Farmer" : advance.farmerId.fullName}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">{CROP_LABELS[advance.cropType]}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatGHS(advance.amountGiven)}</TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {advance.bagsRepaid}/{advance.expectedBags}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={advance.repaymentStatus} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Inventory pressure</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : inventory.length === 0 ? (
              <p className="text-sm text-muted-foreground">No inventory yet.</p>
            ) : (
              inventory.map((item) => {
                const percent = totalBags > 0 ? Math.round((item.quantityBags / totalBags) * 100) : 0;
                return (
                  <div key={item.cropType} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-medium">{CROP_LABELS[item.cropType]}</span>
                      <span className="text-muted-foreground">{item.quantityBags} bags</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted">
                      <div
                        className="h-2 rounded-full bg-primary"
                        style={{ width: `${Math.max(percent, item.quantityBags > 0 ? 6 : 0)}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="truncate text-2xl font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: Advance["repaymentStatus"] }) {
  const label = status === "completed" ? "Completed" : status === "partial" ? "Partial" : "Pending";
  const tone =
    status === "completed"
      ? "bg-green-100 text-green-800"
      : status === "partial"
        ? "bg-sky-100 text-sky-800"
        : "bg-amber-100 text-amber-800";

  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>{label}</span>;
}
