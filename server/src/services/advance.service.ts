import mongoose, { Types } from "mongoose";
import { AppError } from "../errors/AppError";
import {
  FarmerAdvanceDocument,
  FarmerAdvanceModel,
  PRO_RATA_OUTSTANDING,
} from "../models/farmer-advance.model";
import { FarmerModel } from "../models/farmer.model";
import { TransactionModel } from "../models/transaction.model";
import { CreateAdvanceInput, ListAdvancesQuery } from "../validators/advance.validator";

/** Shape of `farmerId` after `.populate("farmerId", "fullName phone")`. */
export interface AdvanceFarmerRef {
  _id: Types.ObjectId;
  fullName: string;
  phone: string;
}

// Derived from the query so the declared type can't drift from what populate
// actually returns (farmerId is a projected farmer, not an ObjectId).
function findAdvancesPopulated(filter: Record<string, unknown>) {
  return FarmerAdvanceModel.find(filter).populate<{ farmerId: AdvanceFarmerRef }>(
    "farmerId",
    "fullName phone"
  );
}

export type PopulatedFarmerAdvance = Awaited<ReturnType<typeof findAdvancesPopulated>>[number];

export interface AdvanceListResult {
  advances: PopulatedFarmerAdvance[];
  total: number;
  page: number;
  pages: number;
}

export interface FarmerAdvanceSummary {
  /**
   * Pesewas still owed across non-completed advances, pro-rated by bags
   * repaid: amountGiven * (expectedBags - bagsRepaid) / expectedBags.
   * Rounding lives here in the display aggregation — never in the ledger.
   */
  outstandingAmount: number;
  totalAdvances: number;
  pendingAdvances: number;
}

export async function createAdvance(
  input: CreateAdvanceInput,
  createdBy: Types.ObjectId
): Promise<FarmerAdvanceDocument> {
  // Safe outside the transaction below: farmers are undeletable (business
  // rule), so this check cannot pass and then dangle.
  const farmer = await FarmerModel.findById(input.farmerId);
  if (!farmer) throw new AppError("Farmer not found", 404);

  // Advance and its ledger entry commit or fail together (business rule:
  // every financial operation must create a transaction record).
  const session = await mongoose.startSession();
  try {
    let advance!: FarmerAdvanceDocument;
    await session.withTransaction(async () => {
      [advance] = await FarmerAdvanceModel.create([input], { session });
      await TransactionModel.create(
        [
          {
            type: "advance_given",
            referenceId: advance._id,
            amount: input.amountGiven,
            description: `Advance to ${farmer.fullName} for ${input.expectedBags} bags of ${input.cropType}`,
            createdBy,
          },
        ],
        { session }
      );
    });
    return advance;
  } finally {
    await session.endSession();
  }
}

export async function listAdvances(query: ListAdvancesQuery): Promise<AdvanceListResult> {
  const filter: Record<string, unknown> = {};
  if (query.farmerId) filter.farmerId = query.farmerId;
  if (query.repaymentStatus) filter.repaymentStatus = query.repaymentStatus;

  const [advances, total] = await Promise.all([
    findAdvancesPopulated(filter)
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit),
    FarmerAdvanceModel.countDocuments(filter),
  ]);

  return { advances, total, page: query.page, pages: Math.max(1, Math.ceil(total / query.limit)) };
}

export async function getAdvanceById(id: string): Promise<PopulatedFarmerAdvance> {
  const [advance] = await findAdvancesPopulated({ _id: id }).limit(1);
  if (!advance) throw new AppError("Advance not found", 404);
  return advance;
}

/**
 * Outstanding is computed here, over the whole collection — never client-side
 * over a paginated slice, which understates it for farmers with many advances.
 */
export async function getFarmerAdvanceSummary(farmerId: string): Promise<FarmerAdvanceSummary> {
  const [result] = await FarmerAdvanceModel.aggregate<{
    outstandingAmount: number;
    totalAdvances: number;
    pendingAdvances: number;
  }>([
    { $match: { farmerId: new Types.ObjectId(farmerId) } },
    {
      $group: {
        _id: null,
        outstandingAmount: { $sum: PRO_RATA_OUTSTANDING },
        totalAdvances: { $sum: 1 },
        pendingAdvances: {
          $sum: { $cond: [{ $ne: ["$repaymentStatus", "completed"] }, 1, 0] },
        },
      },
    },
    { $project: { _id: 0 } },
  ]);

  return result ?? { outstandingAmount: 0, totalAdvances: 0, pendingAdvances: 0 };
}
