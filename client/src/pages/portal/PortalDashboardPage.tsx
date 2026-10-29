import { useCallback, useEffect, useRef, useState } from "react";
import type { ComponentType } from "react";
import { CircleDollarSign, PackageCheck, Wheat } from "lucide-react";
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
import { usePolling } from "@/hooks/usePolling";
import { getApiErrorMessage } from "@/services/api";
import { fetchMyAdvances } from "@/services/farmerPortal";
import type { Advance, FarmerAdvanceSummary, RepaymentStatus } from "@/services/farmerPortal";
import { useFarmerAuth } from "@/context/useFarmerAuth";

const STATUS_LABELS: Record<RepaymentStatus, string> = {
  pending: "Pending",
  partial: "Partially repaid",
  completed: "Completed",
};

const STATUS_STYLES: Record<RepaymentStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  partial: "bg-blue-100 text-blue-800",
  completed: "bg-green-100 text-green-800",
};

export function PortalDashboardPage() {
  const { farmer } = useFarmerAuth();
  const [advances, setAdvances] = useState<Advance[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<FarmerAdvanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Stale-response guard, same pattern as FarmerDetailPage/CustomerDetailPage.
  const requestSeq = useRef(0);

  // `silent` skips the loading/error churn so background polling doesn't flash
  // the page away or replace it with a transient network error.
  const load = useCallback(async (silent = false) => {
    const seq = ++requestSeq.current;
    if (!silent) {
      setLoading(true);
      setError("");
    }
    try {
      const data = await fetchMyAdvances();
      if (seq !== requestSeq.current) return;
      setAdvances(data.advances);
      setTotal(data.total);
      setSummary(data.summary);
      setLoading(false);
      setError("");
    } catch (err) {
      if (seq !== requestSeq.current) return;
      if (!silent) {
        setError(getApiErrorMessage(err));
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // The balance here moves when a trader confirms a claim, so keep it current
  // without the farmer reloading.
  usePolling(() => load(true), 15000);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-medium uppercase text-primary">Welcome</p>
        <h2 className="mt-1 text-3xl font-semibold">{farmer?.fullName}</h2>
      </div>

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {/* Every figure here comes from the server's summary aggregation — never
          summed client-side from the (possibly truncated) advances list. */}
      <section className="grid gap-4 sm:grid-cols-3">
        <SummaryCard
          icon={CircleDollarSign}
          label="Outstanding balance"
          value={formatGHS(summary?.outstandingAmount ?? 0)}
        />
        <SummaryCard icon={Wheat} label="Total advances" value={summary?.totalAdvances ?? 0} />
        <SummaryCard
          icon={PackageCheck}
          label="Open advances"
          value={summary?.pendingAdvances ?? 0}
        />
      </section>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="text-base">Your advances</CardTitle>
          {total > advances.length && (
            <p className="text-xs text-muted-foreground">
              Showing latest {advances.length} of {total} advances.
            </p>
          )}
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
                  <TableHead className="hidden sm:table-cell">Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Crop</TableHead>
                  <TableHead>Bags repaid</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {advances.map((advance) => (
                  <TableRow key={advance._id}>
                    <TableCell className="hidden sm:table-cell">{new Date(advance.createdAt).toLocaleDateString("en-GH")}</TableCell>
                    <TableCell className="whitespace-nowrap font-medium">{formatGHS(advance.amountGiven)}</TableCell>
                    <TableCell>{CROP_LABELS[advance.cropType]}</TableCell>
                    <TableCell>
                      {advance.bagsRepaid} / {advance.expectedBags}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[advance.repaymentStatus]}`}
                      >
                        {STATUS_LABELS[advance.repaymentStatus]}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({
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
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
