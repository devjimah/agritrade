import { Types } from "mongoose";
import { AppError } from "../errors/AppError";
import { FarmerAdvanceModel } from "../models/farmer-advance.model";
import { RepaymentClaimDocument, RepaymentClaimModel } from "../models/repayment-claim.model";
import { ListMyClaimsQuery, SubmitClaimInput } from "../validators/repayment-claim.validator";

export interface ClaimListResult {
  claims: RepaymentClaimDocument[];
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
