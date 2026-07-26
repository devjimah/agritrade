import { Types } from "mongoose";
import { AppError } from "../errors/AppError";
import { FarmerAdvanceModel } from "../models/farmer-advance.model";
import { RepaymentClaimDocument, RepaymentClaimModel } from "../models/repayment-claim.model";
import { createRepayment } from "./repayment.service";
import {
  ListClaimsQuery,
  ListMyClaimsQuery,
  SubmitClaimInput,
} from "../validators/repayment-claim.validator";

export interface ClaimListResult {
  claims: RepaymentClaimDocument[];
  total: number;
  page: number;
  pages: number;
}

/** Shape of `farmerId` after `.populate("farmerId", "fullName phone")`. */
export interface ClaimFarmerRef {
  _id: Types.ObjectId;
  fullName: string;
  phone: string;
}

// Derived from the query so the declared type can't drift from what populate
// actually returns (farmerId is a projected farmer, not an ObjectId) — same
// pattern as findAdvancesPopulated in advance.service.ts.
function findClaimsPopulated(filter: Record<string, unknown>) {
  return RepaymentClaimModel.find(filter).populate<{ farmerId: ClaimFarmerRef }>(
    "farmerId",
    "fullName phone"
  );
}

export type PopulatedRepaymentClaim = Awaited<ReturnType<typeof findClaimsPopulated>>[number];

export interface StaffClaimListResult {
  claims: PopulatedRepaymentClaim[];
  total: number;
  page: number;
  pages: number;
}

/** E11000 specifically on the idempotencyKey index — not just any dup key. */
function isIdempotencyKeyConflict(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { code?: number; keyPattern?: Record<string, unknown> };
  return e.code === 11000 && e.keyPattern?.idempotencyKey !== undefined;
}

/**
 * Records a farmer's repayment claim — an UNVERIFIED ASSERTION, not a
 * repayment. Writes exactly one document (the claim) and nothing else: no
 * mongoose session, no transaction, no touch of FarmerAdvanceModel,
 * InventoryModel, or TransactionModel. A trader must confirm the claim
 * (Task 6, via the existing createRepayment) before any of that moves.
 *
 * The bagsClaimed/remaining check below is advisory only — it exists for a
 * friendly error message, not enforcement. The real guard is
 * createRepayment's atomic guarded update at confirmation time, so a claim
 * that goes stale between submission and confirmation fails safely there,
 * not here.
 */
export async function submitClaim(
  farmerId: Types.ObjectId,
  input: SubmitClaimInput
): Promise<RepaymentClaimDocument> {
  const advance = await FarmerAdvanceModel.findById(input.advanceId);
  // Identical 404 whether the advance doesn't exist or belongs to someone
  // else — a farmer must never learn that an advance id exists but isn't
  // theirs (no 403 here; see cross-tenant handling elsewhere in this codebase).
  if (!advance || !advance.farmerId.equals(farmerId)) {
    throw new AppError("Advance not found", 404);
  }

  if (advance.repaymentStatus === "completed") {
    throw new AppError("This advance is already fully repaid", 400);
  }

  const remaining = advance.expectedBags - advance.bagsRepaid;
  if (input.bagsClaimed > remaining) {
    throw new AppError(
      `Only ${remaining} bag(s) remain on this advance — reduce the bags claimed`,
      400
    );
  }

  try {
    return await RepaymentClaimModel.create({
      advanceId: advance._id,
      farmerId,
      bagsClaimed: input.bagsClaimed,
      idempotencyKey: input.idempotencyKey,
    });
  } catch (err) {
    // True idempotency: a retry of a request that already committed (response
    // lost, double-click) gets the original claim back, not an error. Scoped
    // to farmerId: the key space is global (one unique index across all
    // farmers), so an UNSCOPED lookup here would hand a farmer whoever else's
    // claim happened to collide — cross-tenant disclosure.
    if (isIdempotencyKeyConflict(err)) {
      const existing = await RepaymentClaimModel.findOne({
        idempotencyKey: input.idempotencyKey,
        farmerId,
      });
      if (existing) return existing;
      // The key belongs to another farmer (or vanished). Deliberately the
      // same 409 + message as a key we can't resolve at all, so the response
      // never distinguishes "taken by someone else" from "taken by you but
      // unreadable". A caller who owns the key gets 201; a caller who does
      // not gets 409 — that difference is not an oracle worth closing, since
      // a farmer already knows with certainty which keys are their own (they
      // generated them), so the only "information" leaked is about a key the
      // attacker had to guess in a 122-bit UUID space.
      throw new AppError("This claim was already submitted", 409);
    }
    throw err;
  }
}

export async function listMyClaims(
  farmerId: Types.ObjectId,
  query: ListMyClaimsQuery
): Promise<ClaimListResult> {
  const filter = { farmerId };

  const [claims, total] = await Promise.all([
    RepaymentClaimModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit),
    RepaymentClaimModel.countDocuments(filter),
  ]);

  return {
    claims,
    total,
    page: query.page,
    pages: Math.max(1, Math.ceil(total / query.limit)),
  };
}

/** Trader-facing queue: filters by status, populates farmer name/phone. Filter+sort shape is intended to use the { status: 1, createdAt: -1 } index on the model (confirmed by inspection, not explain()). */
export async function listClaims(query: ListClaimsQuery): Promise<StaffClaimListResult> {
  const filter: Record<string, unknown> = {};
  if (query.status) filter.status = query.status;

  const [claims, total] = await Promise.all([
    findClaimsPopulated(filter)
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit),
    RepaymentClaimModel.countDocuments(filter),
  ]);

  return {
    claims,
    total,
    page: query.page,
    pages: Math.max(1, Math.ceil(total / query.limit)),
  };
}

/**
 * Turns a farmer's unverified claim into real financial state by calling the
 * existing, unmodified createRepayment — the ONLY line in this function with
 * financial effect. No transaction, no ledger/inventory/advance logic here:
 * all of that lives in createRepayment and must not be duplicated.
 *
 * The repayment's idempotencyKey is DERIVED SERVER-SIDE from the claim id
 * (see repaymentKeyForClaim) and never taken from the claim's own
 * farmer-supplied key: a farmer could otherwise submit a claim carrying the
 * key of an EXISTING repayment, and createRepayment's E11000 branch would
 * hand back that unrelated repayment with zero financial effect while this
 * function marked the claim "confirmed". Derivation keeps the double-confirm
 * protection (same claim -> same key) without letting the farmer choose it.
 *
 * If createRepayment throws (e.g. the advance went stale and its guarded
 * update now matches nothing -> 409), that error propagates as-is and the
 * claim is left untouched (still "pending"). A stale claim is not a
 * rejected claim: the trader must see the real reason and decide, so we
 * never catch this and flip status to "rejected".
 *
 * Retry/convergence property: if the process dies AFTER createRepayment
 * commits but BEFORE the claim-status write below lands, the claim is left
 * "pending" and reappears in the queue. A subsequent re-confirm calls
 * createRepayment again with the SAME derived key (the claim's _id never
 * changes), so createRepayment's own E11000 branch returns the
 * ORIGINAL repayment instead of creating a second one — the claim write
 * below then converges on that same repayment id. This is precisely why
 * this path must never be "optimized" into pre-checking for an existing
 * repayment and throwing if one is found: doing so would turn a safe,
 * convergent retry into a permanently stuck claim.
 */
/**
 * Server-derived repayment key: deterministic per claim, so re-confirming the
 * same claim converges on one repayment, and in a `claim:` namespace no farmer
 * input can reach — a farmer-supplied UUID can never equal one of these, so a
 * claim can never be aimed at a pre-existing repayment. Not a UUID, and that's
 * fine: the `z.uuid()` in createRepaymentSchema guards the HTTP boundary only;
 * createRepayment itself takes the key as an opaque string and the model field
 * is `type: String`.
 */
function repaymentKeyForClaim(claimId: Types.ObjectId): string {
  return `claim:${claimId.toString()}`;
}

export async function confirmClaim(
  claimId: string,
  staffUserId: Types.ObjectId
): Promise<RepaymentClaimDocument> {
  const claim = await RepaymentClaimModel.findById(claimId);
  if (!claim) throw new AppError("Claim not found", 404);
  if (claim.status !== "pending") {
    throw new AppError(`This claim is already ${claim.status}`, 400);
  }

  const repayment = await createRepayment(
    {
      advanceId: claim.advanceId.toString(),
      bagsSupplied: claim.bagsClaimed,
      idempotencyKey: repaymentKeyForClaim(claim._id),
      notes: "",
    },
    staffUserId
  );

  // Guarded write, not read-then-save: if two traders raced past the
  // in-memory "pending" check above, only the one whose write still finds
  // status: "pending" here actually flips the claim — last write does not
  // silently clobber the first. The idempotencyKey already prevents a
  // second repayment either way; this guard makes the claim-flip itself
  // single-winner too. The derived key is claim-scoped, so both racers pass
  // the identical key.
  const updated = await RepaymentClaimModel.findOneAndUpdate(
    { _id: claim._id, status: "pending" },
    {
      $set: {
        status: "confirmed",
        resultingRepaymentId: repayment._id,
        reviewedBy: staffUserId,
        reviewedAt: new Date(),
      },
    },
    { returnDocument: "after" }
  );
  if (updated) return updated;

  // We lost the claim-flip race: someone else's write landed first, so
  // `updated` is null. Our createRepayment call above has ALREADY committed
  // real bags/inventory/ledger by this point, so what happens next depends
  // entirely on WHICH write beat us — re-read to find out rather than assuming
  // it was a confirm.
  //
  // NO COMPENSATING WRITE BELONGS IN EITHER BRANCH. The ledger is append-only
  // and the repayment we created is legitimate (the guarded advance update
  // inside createRepayment accepted it); reversing it here would fabricate a
  // second, false ledger movement to paper over a reporting problem. The only
  // thing this branch can honestly do is tell the caller the truth.
  const current = await RepaymentClaimModel.findById(claim._id);

  // Another trader REJECTED the claim in the window between our
  // createRepayment and our flip. The money moved and is correct, but the
  // claim's audit trail now says "rejected" with no resultingRepaymentId, so
  // the repayment is orphaned from any claim. Surface that loudly instead of
  // returning 200 on a claim that reads rejected.
  if (current?.status === "rejected") {
    throw new AppError(
      "A repayment WAS recorded for this claim, but another user rejected the claim first — " +
        "the repayment stands and the ledger is append-only, so reconcile this manually",
      409
    );
  }

  // Otherwise another trader won the CONFIRM race. Because both racers derive
  // the same claim-scoped key, only ONE repayment document exists; return the
  // true post-race state (confirmed, with the winner's
  // reviewedBy/resultingRepaymentId) rather than the stale "pending" snapshot
  // taken before either write landed.
  return current ?? claim;
}

export async function rejectClaim(
  claimId: string,
  staffUserId: Types.ObjectId,
  reason: string
): Promise<RepaymentClaimDocument> {
  const claim = await RepaymentClaimModel.findById(claimId);
  if (!claim) throw new AppError("Claim not found", 404);
  if (claim.status !== "pending") {
    throw new AppError(`This claim is already ${claim.status}`, 400);
  }

  claim.status = "rejected";
  claim.rejectionReason = reason;
  claim.reviewedBy = staffUserId;
  claim.reviewedAt = new Date();
  await claim.save();
  return claim;
}
