import mongoose, { Types } from "mongoose";
import { AppError } from "../errors/AppError";
import { FarmerAdvanceModel } from "../models/farmer-advance.model";
import { FarmerModel } from "../models/farmer.model";
import {
  FarmerRepaymentDocument,
  FarmerRepaymentModel,
} from "../models/farmer-repayment.model";
import { InventoryModel } from "../models/inventory.model";
import { TransactionModel } from "../models/transaction.model";
import { CreateRepaymentInput, ListRepaymentsQuery } from "../validators/repayment.validator";

export interface RepaymentListResult {
  repayments: FarmerRepaymentDocument[];
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
 * Records a repayment atomically:
 *  1. guarded pipeline update on the advance — increments bagsRepaid and
 *     recomputes repaymentStatus in ONE conditional write, so concurrent
 *     repayments can never overshoot expectedBags;
 *  2. creates the repayment document (unique idempotencyKey stops dups);
 *  3. increments inventory for the crop (rule: repayments increase stock);
 *  4. appends the ledger transaction (bags moved, no cash).
 * All four commit or fail together.
 */
export async function createRepayment(
  input: CreateRepaymentInput,
  createdBy: Types.ObjectId
): Promise<FarmerRepaymentDocument> {
  const advance = await FarmerAdvanceModel.findById(input.advanceId);
  if (!advance) throw new AppError("Advance not found", 404);
  if (advance.repaymentStatus === "completed") {
    throw new AppError("This advance is already fully repaid", 400);
  }

  const remaining = advance.expectedBags - advance.bagsRepaid;
  if (input.bagsSupplied > remaining) {
    throw new AppError(
      `Only ${remaining} bag(s) remain on this advance — reduce the bags supplied`,
      400
    );
  }

  // Farmer is undeletable, so this read cannot dangle (same reasoning as
  // advance creation); it exists to name the farmer in the ledger entry.
  const farmer = await FarmerModel.findById(advance.farmerId);
  if (!farmer) throw new AppError("Farmer not found", 404);

  const session = await mongoose.startSession();
  try {
    let repayment!: FarmerRepaymentDocument;
    await session.withTransaction(async () => {
      // The filter re-checks remaining capacity inside the transaction: if a
      // concurrent repayment landed since the pre-read, this matches nothing
      // and we abort instead of overshooting. Using the pre-read expectedBags
      // in the filter is safe ONLY because advances are immutable — an "edit
      // advance" feature would have to move this comparison into the pipeline.
      const updated = await FarmerAdvanceModel.findOneAndUpdate(
        {
          _id: advance._id,
          bagsRepaid: { $lte: advance.expectedBags - input.bagsSupplied },
        },
        [
          {
            $set: {
              bagsRepaid: { $add: ["$bagsRepaid", input.bagsSupplied] },
              repaymentStatus: {
                $cond: [
                  { $gte: [{ $add: ["$bagsRepaid", input.bagsSupplied] }, "$expectedBags"] },
                  "completed",
                  "partial",
                ],
              },
            },
          },
        ],
        { returnDocument: "after", session, updatePipeline: true }
      );
      if (!updated) {
        throw new AppError(
          "This repayment would exceed the bags remaining on the advance — reload and try again",
          409
        );
      }

      [repayment] = await FarmerRepaymentModel.create(
        [
          {
            advanceId: advance._id,
            farmerId: advance.farmerId,
            cropType: advance.cropType,
            bagsSupplied: input.bagsSupplied,
            idempotencyKey: input.idempotencyKey,
            notes: input.notes,
          },
        ],
        { session }
      );

      await InventoryModel.updateOne(
        { cropType: advance.cropType },
        { $inc: { quantityBags: input.bagsSupplied } },
        { upsert: true, session }
      );

      await TransactionModel.create(
        [
          {
            type: "repayment_received",
            referenceId: repayment._id,
            farmerId: advance.farmerId,
            amount: 0,
            bags: input.bagsSupplied,
            description: `Repayment of ${input.bagsSupplied} bag(s) of ${advance.cropType} from ${farmer.fullName}`,
            createdBy,
          },
        ],
        { session }
      );
    });
    return repayment;
  } catch (err) {
    // True idempotency: a retry of a request that already committed (response
    // lost, double-click) gets the original repayment back, not an error.
    if (isIdempotencyKeyConflict(err)) {
      const existing = await FarmerRepaymentModel.findOne({
        idempotencyKey: input.idempotencyKey,
      });
      if (existing) return existing;
      throw new AppError("This repayment was already recorded", 409);
    }
    throw err;
  } finally {
    await session.endSession();
  }
}

export async function listRepayments(query: ListRepaymentsQuery): Promise<RepaymentListResult> {
  const filter: Record<string, unknown> = {};
  if (query.advanceId) filter.advanceId = query.advanceId;
  if (query.farmerId) filter.farmerId = query.farmerId;

  const [repayments, total] = await Promise.all([
    FarmerRepaymentModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit),
    FarmerRepaymentModel.countDocuments(filter),
  ]);

  return {
    repayments,
    total,
    page: query.page,
    pages: Math.max(1, Math.ceil(total / query.limit)),
  };
}
