import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CROP_LABELS, CROP_TYPES } from "@/lib/crops";
import type { CropType } from "@/lib/crops";
import { formatGHS, parseGHSToPesewas } from "@/lib/money";
import { getApiErrorMessage } from "@/services/api";
import { createAdvance, getAdvanceSummary, listAdvances } from "@/services/advances";
import type { Advance, AdvanceSummary, RepaymentStatus } from "@/services/advances";
import { getFarmer } from "@/services/farmers";
import type { Farmer } from "@/services/farmers";

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

export function FarmerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [farmer, setFarmer] = useState<Farmer | null>(null);
  const [advances, setAdvances] = useState<Advance[]>([]);
  const [advanceTotal, setAdvanceTotal] = useState(0);
  const [summary, setSummary] = useState<AdvanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [amountGHS, setAmountGHS] = useState("");
  const [cropType, setCropType] = useState<CropType>("maize");
  const [expectedBags, setExpectedBags] = useState("");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  // Same stale-response guard as FarmersPage: /farmers/A -> /farmers/B does
  // not remount this component, so a slow A response must not clobber B.
  const requestSeq = useRef(0);

  const load = useCallback(async () => {
    if (!id) return;
    const seq = ++requestSeq.current;
    setLoading(true);
    setPageError("");
    try {
      const [farmerData, advanceData, summaryData] = await Promise.all([
        getFarmer(id),
        listAdvances({ farmerId: id, limit: 100 }),
        getAdvanceSummary(id),
      ]);
      if (seq !== requestSeq.current) return;
      setFarmer(farmerData);
      setAdvances(advanceData.advances);
      setAdvanceTotal(advanceData.total);
      setSummary(summaryData);
      setLoading(false);
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setPageError(getApiErrorMessage(err));
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  function openRecordAdvance() {
    setAmountGHS("");
    setCropType("maize");
    setExpectedBags("");
    setNotes("");
    setFormError("");
    setDialogOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    const pesewas = parseGHSToPesewas(amountGHS);
    if (pesewas === null) {
      setFormError("Enter a valid amount in GHS, e.g. 500 or 500.50");
      return;
    }
    const bags = Number(expectedBags);
    if (!Number.isInteger(bags) || bags < 1) {
      setFormError("Expected bags must be a whole number of at least 1");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      await createAdvance({ farmerId: id, amountGiven: pesewas, cropType, expectedBags: bags, notes });
      setDialogOpen(false);
      await load();
    } catch (err) {
      setFormError(getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (pageError) return <p className="text-sm text-red-600">{pageError}</p>;
  if (!farmer) return null;

  return (
    <div className="space-y-4">
      <Link to="/farmers" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to farmers
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">{farmer.fullName}</h2>
          <p className="text-sm text-muted-foreground">
            {farmer.phone}
            {farmer.village ? ` · ${farmer.village}` : ""}
          </p>
          {farmer.notes && <p className="mt-1 text-sm text-muted-foreground">{farmer.notes}</p>}
        </div>
        <Button onClick={openRecordAdvance}>
          <Plus className="mr-1 h-4 w-4" /> Record advance
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            Advances
            {summary && (
              <span className="ml-2 font-normal text-muted-foreground">
                {formatGHS(summary.outstandingAmount)} outstanding
              </span>
            )}
          </CardTitle>
          {advanceTotal > advances.length && (
            <p className="text-xs text-muted-foreground">
              Showing latest {advances.length} of {advanceTotal} advances.
            </p>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {advances.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No advances recorded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Crop</TableHead>
                  <TableHead>Expected bags</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {advances.map((advance) => (
                  <TableRow key={advance._id}>
                    <TableCell>{new Date(advance.createdAt).toLocaleDateString("en-GH")}</TableCell>
                    <TableCell className="font-medium">{formatGHS(advance.amountGiven)}</TableCell>
                    <TableCell>{CROP_LABELS[advance.cropType]}</TableCell>
                    <TableCell>{advance.expectedBags}</TableCell>
                    <TableCell>
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[advance.repaymentStatus]}`}
                      >
                        {STATUS_LABELS[advance.repaymentStatus]}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-muted-foreground">
                      {advance.notes || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} title="Record advance">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="amount">Amount (GHS)</Label>
            <Input
              id="amount"
              required
              inputMode="decimal"
              placeholder="500.00"
              value={amountGHS}
              onChange={(e) => setAmountGHS(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cropType">Crop</Label>
            <Select
              id="cropType"
              value={cropType}
              onChange={(e) => setCropType(e.target.value as CropType)}
            >
              {CROP_TYPES.map((crop) => (
                <option key={crop} value={crop}>
                  {CROP_LABELS[crop]}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="expectedBags">Expected bags</Label>
            <Input
              id="expectedBags"
              required
              inputMode="numeric"
              placeholder="10"
              value={expectedBags}
              onChange={(e) => setExpectedBags(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="advNotes">Notes</Label>
            <Input id="advNotes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Record advance"}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
