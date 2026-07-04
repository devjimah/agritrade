import mongoose, { Types } from "mongoose";
import { AppError } from "../errors/AppError";
import { CreditSaleModel } from "../models/credit-sale.model";
import { CustomerModel } from "../models/customer.model";
import { PaymentDocument, PaymentModel } from "../models/payment.model";
import { TransactionModel } from "../models/transaction.model";
import { CreatePaymentInput, ListPaymentsQuery } from "../validators/payment.validator";

export interface PaymentListResult {
  payments: PaymentDocument[];
  total: number;
  page: number;
  pages: number;
}

/** Human-readable GHS for messages and ledger descriptions (money stays pesewas). */
function ghs(pesewas: number): string {
  return `GHS ${(pesewas / 100).toFixed(2)}`;
}

/** E11000 specifically on the idempotencyKey index — not just any dup key. */
function isIdempotencyKeyConflict(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { code?: number; keyPattern?: Record<string, unknown> };
  return e.code === 11000 && e.keyPattern?.idempotencyKey !== undefined;
}

/**
 * Records a customer payment atomically:
 *  1. guarded pipeline update on the sale — decrements balanceRemaining,
 *     increments amountPaid, and recomputes paymentStatus in ONE conditional
 *     write (filter: balanceRemaining >= amount), so concurrent payments can
 *     never overpay and the amountPaid + balanceRemaining === totalAmount
 *     invariant holds at every commit (rules 4 and 8);
 *  2. creates the payment document (unique idempotencyKey stops dups);
 *  3. appends the ledger transaction.
 * All three commit or fail together.
 */
export async function createPayment(
  input: CreatePaymentInput,
  recordedBy: Types.ObjectId
): Promise<PaymentDocument> {
  const sale = await CreditSaleModel.findById(input.creditSaleId);
  if (!sale) throw new AppError("Credit sale not found", 404);
  if (sale.paymentStatus === "paid") {
    throw new AppError("This sale is already fully paid", 400);
  }
  if (input.amountPaid > sale.balanceRemaining) {
    throw new AppError(
      `Only ${ghs(sale.balanceRemaining)} remains on this sale — reduce the amount`,
      400
    );
  }

  // Customer is undeletable, so this read cannot dangle; it exists to name
  // the customer in the ledger entry.
  const customer = await CustomerModel.findById(sale.customerId);
  if (!customer) throw new AppError("Customer not found", 404);

  const session = await mongoose.startSession();
  try {
    let payment!: PaymentDocument;
    await session.withTransaction(async () => {
      // Re-checks the balance inside the transaction: if a concurrent payment
      // landed since the pre-read, this matches nothing and we abort instead
      // of overpaying. All three money fields move in this single write.
      const updated = await CreditSaleModel.findOneAndUpdate(
        {
          _id: sale._id,
          balanceRemaining: { $gte: input.amountPaid },
        },
        [
          {
            $set: {
              amountPaid: { $add: ["$amountPaid", input.amountPaid] },
              balanceRemaining: { $subtract: ["$balanceRemaining", input.amountPaid] },
              paymentStatus: {
                $cond: [
                  { $lte: [{ $subtract: ["$balanceRemaining", input.amountPaid] }, 0] },
                  "paid",
                  "partial",
                ],
              },
            },
          },
        ],
        { new: true, session, updatePipeline: true }
      );
      if (!updated) {
        throw new AppError(
          "This payment would exceed the balance remaining — reload and try again",
          409
        );
      }

      [payment] = await PaymentModel.create(
        [
          {
            creditSaleId: sale._id,
            customerId: sale.customerId,
            amountPaid: input.amountPaid,
            paymentMethod: input.paymentMethod,
            recordedBy,
            idempotencyKey: input.idempotencyKey,
            notes: input.notes,
          },
        ],
        { session }
      );

      await TransactionModel.create(
        [
          {
            type: "payment_received",
            referenceId: payment._id,
            customerId: sale.customerId,
            amount: input.amountPaid,
            description: `Payment of ${ghs(input.amountPaid)} from ${customer.fullName} (${input.paymentMethod})`,
            createdBy: recordedBy,
          },
        ],
        { session }
      );
    });
    return payment;
  } catch (err) {
    // True idempotency: a retry of a committed request gets the original.
    if (isIdempotencyKeyConflict(err)) {
      const existing = await PaymentModel.findOne({ idempotencyKey: input.idempotencyKey });
      if (existing) return existing;
      throw new AppError("This payment was already recorded", 409);
    }
    throw err;
  } finally {
    await session.endSession();
  }
}

export async function listPayments(query: ListPaymentsQuery): Promise<PaymentListResult> {
  const filter: Record<string, unknown> = {};
  if (query.creditSaleId) filter.creditSaleId = query.creditSaleId;
  if (query.customerId) filter.customerId = query.customerId;

  const [payments, total] = await Promise.all([
    PaymentModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit),
    PaymentModel.countDocuments(filter),
  ]);

  return {
    payments,
    total,
    page: query.page,
    pages: Math.max(1, Math.ceil(total / query.limit)),
  };
}
