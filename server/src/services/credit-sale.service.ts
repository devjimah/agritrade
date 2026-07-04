import mongoose, { Types } from "mongoose";
import { AppError } from "../errors/AppError";
import { CreditSaleDocument, CreditSaleModel } from "../models/credit-sale.model";
import { CustomerModel } from "../models/customer.model";
import { InventoryModel } from "../models/inventory.model";
import { TransactionModel } from "../models/transaction.model";
import {
  CreateCreditSaleInput,
  ListCreditSalesQuery,
} from "../validators/credit-sale.validator";

export interface CreditSaleListResult {
  sales: CreditSaleDocument[];
  total: number;
  page: number;
  pages: number;
}

export interface CustomerDebtSummary {
  /** Pesewas still owed across non-paid sales. */
  outstandingBalance: number;
  totalSales: number;
  unpaidSales: number;
}

/** E11000 specifically on the idempotencyKey index — not just any dup key. */
function isIdempotencyKeyConflict(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { code?: number; keyPattern?: Record<string, unknown> };
  return e.code === 11000 && e.keyPattern?.idempotencyKey !== undefined;
}

/**
 * Records a credit sale atomically:
 *  1. guarded conditional decrement of inventory — matches only when enough
 *     stock exists, so quantityBags can never go negative, even under
 *     concurrent sales (business rule 1);
 *  2. creates the sale (totalAmount computed here, never trusted from the
 *     client; unique idempotencyKey stops double-submits);
 *  3. appends the ledger transaction.
 * All three commit or fail together.
 */
export async function createCreditSale(
  input: CreateCreditSaleInput,
  createdBy: Types.ObjectId
): Promise<CreditSaleDocument> {
  const customer = await CustomerModel.findById(input.customerId);
  if (!customer) throw new AppError("Customer not found", 404);

  // Friendly pre-check; the in-transaction guarded update is the enforcement.
  const stock = await InventoryModel.findOne({ cropType: input.cropType });
  const available = stock?.quantityBags ?? 0;
  if (input.bagsTaken > available) {
    throw new AppError(
      `Only ${available} bag(s) of ${input.cropType} in stock — cannot sell ${input.bagsTaken}`,
      400
    );
  }

  const totalAmount = input.bagsTaken * input.pricePerBag;

  const session = await mongoose.startSession();
  try {
    let sale!: CreditSaleDocument;
    await session.withTransaction(async () => {
      // Matches only if stock is still sufficient at commit time; a
      // concurrent sale that drained stock makes this a no-match and we
      // abort instead of going negative.
      const decremented = await InventoryModel.updateOne(
        { cropType: input.cropType, quantityBags: { $gte: input.bagsTaken } },
        { $inc: { quantityBags: -input.bagsTaken } },
        { session }
      );
      if (decremented.matchedCount === 0) {
        throw new AppError(
          `Not enough ${input.cropType} in stock — another sale may have just been recorded`,
          409
        );
      }

      [sale] = await CreditSaleModel.create(
        [
          {
            customerId: input.customerId,
            cropType: input.cropType,
            bagsTaken: input.bagsTaken,
            pricePerBag: input.pricePerBag,
            totalAmount,
            amountPaid: 0,
            balanceRemaining: totalAmount,
            idempotencyKey: input.idempotencyKey,
            notes: input.notes,
          },
        ],
        { session }
      );

      await TransactionModel.create(
        [
          {
            type: "credit_sale",
            referenceId: sale._id,
            customerId: customer._id,
            amount: totalAmount,
            bags: input.bagsTaken,
            description: `Credit sale of ${input.bagsTaken} bag(s) of ${input.cropType} to ${customer.fullName}`,
            createdBy,
          },
        ],
        { session }
      );
    });
    return sale;
  } catch (err) {
    // True idempotency: a retry of a committed request gets the original sale.
    if (isIdempotencyKeyConflict(err)) {
      const existing = await CreditSaleModel.findOne({ idempotencyKey: input.idempotencyKey });
      if (existing) return existing;
      throw new AppError("This sale was already recorded", 409);
    }
    throw err;
  } finally {
    await session.endSession();
  }
}

export async function listCreditSales(
  query: ListCreditSalesQuery
): Promise<CreditSaleListResult> {
  const filter: Record<string, unknown> = {};
  if (query.customerId) filter.customerId = query.customerId;
  if (query.paymentStatus) filter.paymentStatus = query.paymentStatus;

  const [sales, total] = await Promise.all([
    CreditSaleModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit),
    CreditSaleModel.countDocuments(filter),
  ]);

  return { sales, total, page: query.page, pages: Math.max(1, Math.ceil(total / query.limit)) };
}

/**
 * Outstanding debt computed server-side over the whole collection — never
 * client-side over a paginated slice. balanceRemaining is kept exact by the
 * atomic payment updates, so a plain $sum is correct (no pro-rating needed).
 */
export async function getCustomerDebtSummary(customerId: string): Promise<CustomerDebtSummary> {
  const [result] = await CreditSaleModel.aggregate<CustomerDebtSummary>([
    { $match: { customerId: new Types.ObjectId(customerId) } },
    {
      $group: {
        _id: null,
        outstandingBalance: { $sum: "$balanceRemaining" },
        totalSales: { $sum: 1 },
        unpaidSales: {
          $sum: { $cond: [{ $ne: ["$paymentStatus", "paid"] }, 1, 0] },
        },
      },
    },
    { $project: { _id: 0 } },
  ]);

  return result ?? { outstandingBalance: 0, totalSales: 0, unpaidSales: 0 };
}
