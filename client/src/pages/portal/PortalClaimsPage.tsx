import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Plus } from "lucide-react";
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
import { CROP_LABELS } from "@/lib/crops";
import { usePolling } from "@/hooks/usePolling";
import { getApiErrorMessage } from "@/services/api";
import { fetchMyAdvances, fetchMyClaims, submitClaim } from "@/services/farmerPortal";
import type { Advance, RepaymentClaim, RepaymentClaimStatus } from "@/services/farmerPortal";

const STATUS_LABELS: Record<RepaymentClaimStatus, string> = {
  pending: "Pending review",
  confirmed: "Confirmed",
  rejected: "Rejected",
};

const STATUS_STYLES: Record<RepaymentClaimStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  confirmed: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
};

export function PortalClaimsPage() {
  const [advances, setAdvances] = useState<Advance[]>([]);
  const [claims, setClaims] = useState<RepaymentClaim[]>([]);
  const [claimsTotal, setClaimsTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [advanceId, setAdvanceId] = useState("");
  const [bagsClaimed, setBagsClaimed] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  // One key per dialog-open: a double-click or retry after a network error
  // resubmits the SAME key, so the server returns the original claim instead
  // of creating a duplicate. Same lifecycle as FarmerDetailPage's repay dialog.
  const [claimKey, setClaimKey] = useState("");

  const requestSeq = useRef(0);

  // `silent` skips the loading/error churn so background polling doesn't flash
  // the page away or replace it with a transient network error.
  const load = useCallback(async (silent = false) => {
    const seq = ++requestSeq.current;
    if (!silent) {
      setLoading(true);
      setPageError("");
    }
    try {
      const [advanceData, claimData] = await Promise.all([fetchMyAdvances(), fetchMyClaims()]);
      if (seq !== requestSeq.current) return;
      setAdvances(advanceData.advances);
      setClaims(claimData.claims);
      setClaimsTotal(claimData.total);
      setLoading(false);
      setPageError("");
    } catch (err) {
      if (seq !== requestSeq.current) return;
      if (!silent) {
        setPageError(getApiErrorMessage(err));
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // A farmer submits a claim and then waits on the trader; poll so the status
  // flips to Confirmed/Rejected on its own. Paused while the submit dialog is
  // open so a refresh can't change the advance list mid-entry.
  usePolling(() => load(true), 15000, !dialogOpen);

  const openAdvances = advances.filter((a) => a.repaymentStatus !== "completed");

  function openClaimDialog() {
    setAdvanceId(openAdvances[0]?._id ?? "");
    setBagsClaimed("");
    setFormError("");
    setClaimKey(crypto.randomUUID());
    setDialogOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const advance = advances.find((a) => a._id === advanceId);
    if (!advance) {
      setFormError("Select an advance");
      return;
    }
    const bags = Number(bagsClaimed);
    if (!Number.isInteger(bags) || bags < 1) {
      setFormError("Bags claimed must be a whole number of at least 1");
      return;
    }
    const remaining = advance.expectedBags - advance.bagsRepaid;
    if (bags > remaining) {
      setFormError(`Only ${remaining} bag(s) remain on this advance`);
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      await submitClaim({ advanceId, bagsClaimed: bags, idempotencyKey: claimKey });
      setDialogOpen(false);
      await load();
    } catch (err) {
      setFormError(getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-3xl font-semibold">Repayment claims</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Tell us how many bags you delivered. A trader will confirm it against the advance.
          </p>
        </div>
        <Button onClick={openClaimDialog} disabled={openAdvances.length === 0}>
          <Plus className="mr-1 h-4 w-4" /> Submit a claim
        </Button>
      </div>

      {pageError && (
        <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {pageError}
        </p>
      )}

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="text-base">Your claims</CardTitle>
          {claimsTotal > claims.length && (
            <p className="text-xs text-muted-foreground">
              Showing latest {claims.length} of {claimsTotal} claims.
            </p>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <p className="p-6 text-sm text-muted-foreground">Loading...</p>
          ) : claims.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No claims submitted yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Bags claimed</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {claims.map((claim) => (
                  <TableRow key={claim._id}>
                    <TableCell>{new Date(claim.createdAt).toLocaleDateString("en-GH")}</TableCell>
                    <TableCell>{claim.bagsClaimed}</TableCell>
                    <TableCell>
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[claim.status]}`}
                      >
                        {STATUS_LABELS[claim.status]}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-muted-foreground">
                      {claim.rejectionReason || "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} title="Submit a repayment claim">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="claimAdvance">Advance</Label>
            <Select id="claimAdvance" value={advanceId} onChange={(e) => setAdvanceId(e.target.value)}>
              {openAdvances.map((advance) => (
                <option key={advance._id} value={advance._id}>
                  {CROP_LABELS[advance.cropType]} — {advance.expectedBags - advance.bagsRepaid} bag(s) remaining
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="claimBags">Bags claimed</Label>
            <Input
              id="claimBags"
              required
              inputMode="numeric"
              placeholder="5"
              value={bagsClaimed}
              onChange={(e) => setBagsClaimed(e.target.value)}
            />
          </div>
          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Submitting..." : "Submit claim"}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
