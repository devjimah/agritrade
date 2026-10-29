import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { ClipboardCheck } from "lucide-react";
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
import { usePolling } from "@/hooks/usePolling";
import { getApiErrorMessage } from "@/services/api";
import {
  confirmRepaymentClaim,
  listRepaymentClaims,
  rejectRepaymentClaim,
} from "@/services/repaymentClaims";
import type { RepaymentClaimStatus, StaffRepaymentClaim } from "@/services/repaymentClaims";

const STATUS_LABELS: Record<RepaymentClaimStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  rejected: "Rejected",
};

const STATUS_STYLES: Record<RepaymentClaimStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  confirmed: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
};

export function RepaymentClaimsQueuePage() {
  const [claims, setClaims] = useState<StaffRepaymentClaim[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<RepaymentClaimStatus | "">("pending");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState("");

  const [rejectClaim, setRejectClaim] = useState<StaffRepaymentClaim | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectError, setRejectError] = useState("");
  const [rejectSaving, setRejectSaving] = useState(false);

  // Stale-response guard: switching the status filter fires a new request,
  // and a slow earlier response must not clobber a newer one's results.
  const requestSeq = useRef(0);

  // `silent` skips the loading/error churn so background polling doesn't flash
  // the table away or replace it with a transient network error.
  const load = useCallback(
    async (silent = false) => {
      const seq = ++requestSeq.current;
      if (!silent) {
        setLoading(true);
        setError("");
      }
      try {
        const data = await listRepaymentClaims({ status: status || undefined, limit: 100 });
        if (seq !== requestSeq.current) return;
        setClaims(data.claims);
        setTotal(data.total);
        setLoading(false);
        setError("");
      } catch (err) {
        if (seq !== requestSeq.current) return;
        if (!silent) {
          setError(getApiErrorMessage(err));
          setLoading(false);
        }
      }
    },
    [status]
  );

  useEffect(() => {
    load();
  }, [load]);

  // Keep the queue current so a trader sees newly submitted claims without
  // reloading. Paused while a reject dialog is open or a confirm is in flight,
  // so a refresh can't move the row someone is acting on.
  const pollEnabled = rejectClaim === null && confirmingId === null;
  usePolling(() => load(true), 15000, pollEnabled);

  async function handleConfirm(claim: StaffRepaymentClaim) {
    setConfirmingId(claim._id);
    setConfirmError("");
    try {
      // Do NOT optimistically mark the row confirmed: confirm can legitimately
      // fail (e.g. the advance changed since the claim was submitted), and the
      // claim stays "pending" server-side. Only reload on success.
      await confirmRepaymentClaim(claim._id);
      await load();
    } catch (err) {
      setConfirmError(getApiErrorMessage(err));
    } finally {
      setConfirmingId(null);
    }
  }

  function openReject(claim: StaffRepaymentClaim) {
    setRejectClaim(claim);
    setRejectReason("");
    setRejectError("");
  }

  async function handleRejectSubmit(e: FormEvent) {
    e.preventDefault();
    if (!rejectClaim) return;
    if (!rejectReason.trim()) {
      setRejectError("A rejection reason is required");
      return;
    }
    setRejectSaving(true);
    setRejectError("");
    try {
      await rejectRepaymentClaim(rejectClaim._id, rejectReason.trim());
      setRejectClaim(null);
      await load();
    } catch (err) {
      setRejectError(getApiErrorMessage(err));
    } finally {
      setRejectSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="inline-flex items-center gap-2 rounded-md bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
          <ClipboardCheck className="h-4 w-4" /> Repayment claims
        </div>
        <h2 className="mt-3 text-3xl font-semibold">Confirmation queue</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Farmer-submitted claims awaiting confirmation against the ledger.
        </p>
      </div>

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {confirmError && (
        <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {confirmError}
        </p>
      )}

      <Card className="overflow-hidden">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Claims</CardTitle>
            {total > claims.length && (
              <p className="mt-1 text-xs text-muted-foreground">
                Showing latest {claims.length} of {total} claims.
              </p>
            )}
          </div>
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as RepaymentClaimStatus | "")}
            className="w-44"
            aria-label="Filter by status"
          >
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="rejected">Rejected</option>
            <option value="">All statuses</option>
          </Select>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <p className="p-6 text-sm text-muted-foreground">Loading...</p>
          ) : claims.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No claims found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Farmer</TableHead>
                  <TableHead>Bags claimed</TableHead>
                  <TableHead className="hidden sm:table-cell">Submitted</TableHead>
                  <TableHead className="hidden sm:table-cell">Status</TableHead>
                  <TableHead className="sm:w-48" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {claims.map((claim) => (
                  <TableRow key={claim._id}>
                    <TableCell className="font-medium">
                      <Link
                        to={`/farmers/${claim.farmerId._id}`}
                        className="text-primary hover:underline"
                      >
                        {claim.farmerId.fullName}
                      </Link>
                      <p className="text-xs text-muted-foreground">{claim.farmerId.phone}</p>
                    </TableCell>
                    <TableCell>{claim.bagsClaimed}</TableCell>
                    <TableCell className="hidden sm:table-cell">{new Date(claim.createdAt).toLocaleDateString("en-GH")}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[claim.status]}`}
                      >
                        {STATUS_LABELS[claim.status]}
                      </span>
                    </TableCell>
                    <TableCell>
                      {claim.status === "pending" && (
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openReject(claim)}
                            disabled={confirmingId === claim._id}
                          >
                            Reject
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleConfirm(claim)}
                            disabled={confirmingId === claim._id}
                          >
                            {confirmingId === claim._id ? "Confirming..." : "Confirm"}
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={rejectClaim !== null} onClose={() => setRejectClaim(null)} title="Reject claim">
        {rejectClaim && (
          <form onSubmit={handleRejectSubmit} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {rejectClaim.farmerId.fullName} claimed {rejectClaim.bagsClaimed} bag(s). This will
              not affect the advance or ledger.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="rejectReason">Reason</Label>
              <Input
                id="rejectReason"
                required
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
            </div>
            {rejectError && <p className="text-sm text-red-600">{rejectError}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setRejectClaim(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={rejectSaving}>
                {rejectSaving ? "Rejecting..." : "Reject claim"}
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </div>
  );
}
