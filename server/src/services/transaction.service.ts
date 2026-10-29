import { z } from "zod";
import { TransactionDocument, TransactionModel } from "../models/transaction.model";
import { TRANSACTION_TYPES, TransactionType } from "../types";
import { objectIdSchema } from "../validators/farmer.validator";

export const listTransactionsQuerySchema = z.object({
  type: z.enum(TRANSACTION_TYPES).optional(),
  farmerId: objectIdSchema.optional(),
  customerId: objectIdSchema.optional(),
  /** Inclusive range on createdAt. */
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListTransactionsQuery = z.infer<typeof listTransactionsQuerySchema>;

export interface TransactionListResult {
  transactions: TransactionDocument[];
  total: number;
  page: number;
  pages: number;
}

function dateRange(from?: Date, to?: Date) {
  if (!from && !to) return undefined;
  return { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
}

/** Read-only view over the append-only ledger. */
export async function listTransactions(
  query: ListTransactionsQuery
): Promise<TransactionListResult> {
  const filter: Record<string, unknown> = {};
  if (query.type) filter.type = query.type;
  if (query.farmerId) filter.farmerId = query.farmerId;
  if (query.customerId) filter.customerId = query.customerId;
  const createdAt = dateRange(query.from, query.to);
  if (createdAt) filter.createdAt = createdAt;

  const [transactions, total] = await Promise.all([
    TransactionModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit),
    TransactionModel.countDocuments(filter),
  ]);

  return {
    transactions,
    total,
    page: query.page,
    pages: Math.max(1, Math.ceil(total / query.limit)),
  };
}

export interface ActivitySummaryRow {
  type: TransactionType;
  count: number;
  /** Pesewas. */
  amount: number;
  bags: number;
}

/** Ledger totals per transaction type over a period: "this week's sales". */
export async function getActivitySummary(from: Date, to: Date): Promise<ActivitySummaryRow[]> {
  const rows = await TransactionModel.aggregate<{ _id: TransactionType; count: number; amount: number; bags: number }>([
    { $match: { createdAt: dateRange(from, to) } },
    {
      $group: {
        _id: "$type",
        count: { $sum: 1 },
        amount: { $sum: "$amount" },
        bags: { $sum: { $ifNull: ["$bags", 0] } },
      },
    },
  ]);
  const byType = new Map(rows.map((r) => [r._id, r]));
  return TRANSACTION_TYPES.map((type) => ({
    type,
    count: byType.get(type)?.count ?? 0,
    amount: byType.get(type)?.amount ?? 0,
    bags: byType.get(type)?.bags ?? 0,
  }));
}
