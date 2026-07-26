import { useCallback, useEffect, useRef, useState } from "react";
import type { ComponentType, FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CircleDollarSign, KeyRound, PackageCheck, Phone, Plus, Wheat } from "lucide-react";
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
import { getFarmer, setFarmerPin } from "@/services/farmers";
import type { Farmer } from "@/services/farmers";
import { createRepayment } from "@/services/repayments";

const STATUS_LABELS: Record<RepaymentStatus, string> = {
  pending: "Pending",
  partial: "Partially repaid",
  completed: "Completed",
};

const STATUS_STYLES: Record<RepaymentStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  partial: "bg-sky-100 text-sky-800",
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

  const [repayAdvance, setRepayAdvance] = useState<Advance | null>(null);
  const [repayBags, setRepayBags] = useState("");
  const [repayNotes, setRepayNotes] = useState("");
  const [repayError, setRepayError] = useState("");
  const [repaySaving, setRepaySaving] = useState(false);
  const [repayKey, setRepayKey] = useState("");

  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinSaving, setPinSaving] = useState(false);

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

  async function handleSubmit(e: FormEvent) {
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

  function openSetPin() {
    setPin("");
    setPinConfirm("");
    setPinError("");
    setPinDialogOpen(true);
  }

  async function handlePinSubmit(e: FormEvent) {
    e.preventDefault();
    if (!id) return;
    if (!/^\d{4,6}$/.test(pin)) {
      setPinError("PIN must be 4-6 digits");
      return;
    }
    if (pin !== pinConfirm) {
      setPinError("PINs do not match");
      return;
    }
    setPinSaving(true);
    setPinError("");
    try {
      await setFarmerPin(id, pin);
      setPinDialogOpen(false);
      setPin("");
      setPinConfirm("");
    } catch (err) {
      setPinError(getApiErrorMessage(err));
    } finally {
      setPinSaving(false);
    }
  }

  function openRepay(advance: Advance) {
    setRepayAdvance(advance);
    setRepayBags("");
    setRepayNotes("");
    setRepayError("");
    setRepayKey(crypto.randomUUID());
  }

  async function handleRepaySubmit(e: FormEvent) {
    e.preventDefault();
    if (!repayAdvance) return;
    const bags = Number(repayBags);
    const remaining = repayAdvance.expectedBags - repayAdvance.bagsRepaid;
    if (!Number.isInteger(bags) || bags < 1) {
      setRepayError("Bags must be a whole number of at least 1");
      return;
    }
    if (bags > remaining) {
      setRepayError(`Only ${remaining} bag(s) remain on this advance`);
      return;
    }
    setRepaySaving(true);
    setRepayError("");
    try {
      await createRepayment({
        advanceId: repayAdvance._id,
        bagsSupplied: bags,
        idempotencyKey: repayKey,
        notes: repayNotes,
      });
      setRepayAdvance(null);
      await load();
    } catch (err) {
      setRepayError(getApiErrorMessage(err));
    } finally {
      setRepaySaving(false);
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading...</p>;
  if (pageError) return <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{pageError}</p>;
  if (!farmer) return null;

  const expectedBagsTotal = advances.reduce((sum, advance) => sum + advance.expectedBags, 0);
  const repaidBagsTotal = advances.reduce((sum, advance) => sum + advance.bagsRepaid, 0);

  return (
    <div className="space-y-5">
      <Link to="/farmers" className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to farmers
      </Link>

      <section className="rounded-lg border border-primary/10 bg-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase text-primary">Farmer account</p>
            <h2 className="mt-2 text-3xl font-semibold">{farmer.fullName}</h2>
            <p className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Phone className="h-4 w-4" /> {farmer.phone}
              </span>
              {farmer.village && <span>{farmer.village}</span>}
            </p>
            {farmer.notes && <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{farmer.notes}</p>}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={openSetPin}>
              <KeyRound className="mr-1 h-4 w-4" /> Set portal PIN
            </Button>
            <Button onClick={openRecordAdvance}>
              <Plus className="mr-1 h-4 w-4" /> Record advance
            </Button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <SummaryCard icon={CircleDollarSign} label="Outstanding advance" value={formatGHS(summary?.outstandingAmount ?? 0)} />
        <SummaryCard icon={Wheat} label="Expected bags" value={expectedBagsTotal} />
        <SummaryCard icon={PackageCheck} label="Bags repaid" value={`${repaidBagsTotal}/${expectedBagsTotal}`} />
      </section>

      <Card className="overflow-hidden">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Advances</CardTitle>
            {advanceTotal > advances.length && (
              <p className="mt-1 text-xs text-muted-foreground">
                Showing latest {advances.length} of {advanceTotal} advances.
              </p>
            )}
          </div>
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
                  <TableHead>Bags repaid</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {advances.map((advance) => (
                  <TableRow key={advance._id}>
                    <TableCell>{new Date(advance.createdAt).toLocaleDateString("en-GH")}</TableCell>
                    <TableCell className="font-medium">{formatGHS(advance.amountGiven)}</TableCell>
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
                    <TableCell className="max-w-xs truncate text-muted-foreground">
                      {advance.notes || "-"}
                    </TableCell>
                    <TableCell>
                      {advance.repaymentStatus !== "completed" && (
                        <Button variant="outline" size="sm" onClick={() => openRepay(advance)}>
                          Repay
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={pinDialogOpen} onClose={() => setPinDialogOpen(false)} title="Set portal PIN">
        <form onSubmit={handlePinSubmit} className="space-y-4">
          <p className="text-sm text-muted-foreground">
            The farmer will use this PIN to sign in to the portal. It is not shown again after
            saving.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="pin">PIN</Label>
            <Input
              id="pin"
              required
              type="password"
              inputMode="numeric"
              autoComplete="off"
              placeholder="4-6 digits"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pinConfirm">Confirm PIN</Label>
            <Input
              id="pinConfirm"
              required
              type="password"
              inputMode="numeric"
              autoComplete="off"
              placeholder="4-6 digits"
              value={pinConfirm}
              onChange={(e) => setPinConfirm(e.target.value)}
            />
          </div>
          {pinError && <p className="text-sm text-red-600">{pinError}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setPinDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pinSaving}>
              {pinSaving ? "Saving..." : "Set PIN"}
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog open={repayAdvance !== null} onClose={() => setRepayAdvance(null)} title="Record repayment">
        {repayAdvance && (
          <form onSubmit={handleRepaySubmit} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {CROP_LABELS[repayAdvance.cropType]} advance of {formatGHS(repayAdvance.amountGiven)}.
              {" "}
              {repayAdvance.expectedBags - repayAdvance.bagsRepaid} of {repayAdvance.expectedBags} bag(s)
              remaining.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="repayBags">Bags supplied</Label>
              <Input
                id="repayBags"
                required
                inputMode="numeric"
                placeholder="5"
                value={repayBags}
                onChange={(e) => setRepayBags(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="repayNotes">Notes</Label>
              <Input id="repayNotes" value={repayNotes} onChange={(e) => setRepayNotes(e.target.value)} />
            </div>
            {repayError && <p className="text-sm text-red-600">{repayError}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setRepayAdvance(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={repaySaving}>
                {repaySaving ? "Saving..." : "Record repayment"}
              </Button>
            </div>
          </form>
        )}
      </Dialog>

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
            <Select id="cropType" value={cropType} onChange={(e) => setCropType(e.target.value as CropType)}>
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
              {saving ? "Saving..." : "Record advance"}
            </Button>
          </div>
        </form>
      </Dialog>
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
