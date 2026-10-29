import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { ProposalCard } from "@/components/ai/ProposalCard";
import { PROPOSAL_STATUS_LABELS } from "@/lib/aiProposals";
import { useBusyTracker } from "@/hooks/useBusyTracker";
import { usePolling } from "@/hooks/usePolling";
import { getApiErrorMessage } from "@/services/api";
import { listProposals } from "@/services/ai";
import type { AiProposal, ProposalStatus } from "@/services/ai";

const STATUSES: ProposalStatus[] = ["pending", "applying", "confirmed", "rejected"];

export function AiProposalsQueuePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  // ?batch=<id> narrows to the rows read from one notebook photo.
  const batchId = searchParams.get("batch") ?? undefined;

  const [proposals, setProposals] = useState<AiProposal[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<ProposalStatus | "">("pending");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const { anyBusy, handlerFor } = useBusyTracker();

  // Stale-response guard, same as the repayment-claims queue.
  const requestSeq = useRef(0);

  const load = useCallback(
    async (silent = false) => {
      const seq = ++requestSeq.current;
      if (!silent) {
        setLoading(true);
        setError("");
      }
      try {
        const data = await listProposals({ status: status || undefined, batchId, limit: 100 });
        if (seq !== requestSeq.current) return;
        setProposals(data.proposals);
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
    [status, batchId]
  );

  useEffect(() => {
    load();
  }, [load]);

  usePolling(() => load(true), 15000, !anyBusy);

  return (
    <div className="space-y-5">
      <div>
        <div className="inline-flex items-center gap-2 rounded-md bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
          <Inbox className="h-4 w-4" /> AI proposals
        </div>
        <h2 className="mt-3 text-3xl font-semibold">Review queue</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Entries the assistant drafted from chat and notebook photos. Nothing reaches the ledger
          until you confirm it.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          {batchId ? (
            <span>
              Showing one notebook page.{" "}
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0"
                onClick={() => setSearchParams({})}
              >
                Show all
              </Button>
            </span>
          ) : (
            total > proposals.length && `Showing latest ${proposals.length} of ${total}.`
          )}
        </div>
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value as ProposalStatus | "")}
          className="w-44"
          aria-label="Filter by status"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {PROPOSAL_STATUS_LABELS[s]}
            </option>
          ))}
          <option value="">All statuses</option>
        </Select>
      </div>

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : proposals.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No proposals here. Ask the{" "}
          <Link to="/assistant" className="text-primary hover:underline">
            assistant
          </Link>{" "}
          to record something, or photograph a notebook page.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {proposals.map((p) => (
            <ProposalCard
              key={p._id}
              proposal={p}
              onChanged={() => load(true)}
              onBusyChange={handlerFor(p._id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
