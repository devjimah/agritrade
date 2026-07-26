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
    // lost, double-click) gets the original claim back, not an error.
    if (isIdempotencyKeyConflict(err)) {
      const existing = await RepaymentClaimModel.findOne({
        idempotencyKey: input.idempotencyKey,
      });
      if (existing) return existing;
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
 * The idempotencyKey passed through is the claim's own key, so a double
 * confirm (retry, double-click) resolves via createRepayment's existing
 * idempotency handling rather than creating a second repayment.
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
 * createRepayment again with the SAME idempotencyKey (claim.idempotencyKey
 * never changes), so createRepayment's own E11000 branch returns the
 * ORIGINAL repayment instead of creating a second one — the claim write
 * below then converges on that same repayment id. This is precisely why
 * this path must never be "optimized" into pre-checking for an existing
 * repayment and throwing if one is found: doing so would turn a safe,
 * convergent retry into a permanently stuck claim.
 */
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
      idempotencyKey: claim.idempotencyKey,
      notes: "",
    },
    staffUserId
  );

  // Guarded write, not read-then-save: if two traders raced past the
  // in-memory "pending" check above, only the one whose write still finds
  // status: "pending" here actually flips the claim — last write does not
  // silently clobber the first. The idempotencyKey already prevents a
  // second repayment either way; this guard makes the claim-flip itself
  // single-winner too.
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
  return updated ?? claim;
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
